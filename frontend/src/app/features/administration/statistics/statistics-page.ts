import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { StatisticsApiService } from '../../../core/api/statistics-api.service';
import { DSPACE_API_BASE } from '../../../core/api/dspace-rest.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import {
  REPORTS_BY_DSO_TYPE,
  UsageReport,
  UsageReportDsoType,
  UsageReportType,
} from './usage-report.model';
import { UsageReportTable } from './components/usage-report-table/usage-report-table';
import { MonthlyVisitsGrid } from './components/monthly-visits-grid/monthly-visits-grid';

/**
 * Tupla por reporte cargada en la vista: el tipo se usa para mapear al
 * título y al componente presentacional; el report es el shape crudo del
 * backend o `null` cuando el fetch falló (cae al empty state visual).
 */
interface LoadedReport {
  reportType: UsageReportType;
  report: UsageReport | null;
}

const DSO_TYPE_TITLES: Readonly<Record<UsageReportDsoType, string>> = {
  site: 'Estadísticas del repositorio',
  item: 'Estadísticas del recurso',
  collection: 'Estadísticas del programa',
};

/**
 * Container reusable que monta la pantalla de estadísticas para un DSO. La
 * ruta declara el `dsoType` en `data` y el `dsoUuid` viene del parámetro
 * `:uuid` (excepto para `site`, donde el container lo descubre vía
 * `/api/core/sites`). Resuelve la matriz `REPORTS_BY_DSO_TYPE` y dispara
 * los fetches en paralelo con `forkJoin`. Cada fetch cae a `null` en error
 * para que la tarjeta caiga al empty state sin romper la página entera.
 */
@Component({
  selector: 'app-statistics-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    RouterModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    UsageReportTable,
    MonthlyVisitsGrid,
  ],
  templateUrl: './statistics-page.html',
})
export class StatisticsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(StatisticsApiService);
  private readonly http = inject(HttpClient);

  /** dsoType viene de `route.data['dsoType']` declarado en `app.routes.ts`. */
  readonly dsoType = toSignal(
    this.route.data.pipe(map((d) => d['dsoType'] as UsageReportDsoType)),
  );

  /** dsoUuid viene de `route.params['uuid']` excepto cuando dsoType=site. */
  readonly routeUuid = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('uuid') ?? '')),
  );

  readonly resolvedUuid = signal<string | null>(null);
  /** Href absoluto del Site capturado del response de `/core/sites`; solo se usa
   *  cuando dsoType=site para llamar al endpoint search/object. */
  readonly resolvedSiteHref = signal<string | null>(null);
  readonly loaded = signal<LoadedReport[] | null>(null);
  readonly errored = signal(false);

  readonly title = computed(() => {
    const t = this.dsoType();
    return t ? DSO_TYPE_TITLES[t] : 'Estadísticas';
  });

  readonly loading = computed(() => this.loaded() === null && !this.errored());

  constructor() {
    // Resuelve el dsoUuid: para 'site' descubre el UUID + href via /api/core/sites;
    // para 'item' y 'collection' lo toma del route param.
    effect(() => {
      const type = this.dsoType();
      if (!type) return;
      if (type === 'site') {
        this.discoverSite$()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(({ uuid, href }) => {
            this.resolvedSiteHref.set(href);
            this.resolvedUuid.set(uuid);
          });
      } else {
        const fromRoute = this.routeUuid();
        if (fromRoute) this.resolvedUuid.set(fromRoute);
      }
    });

    // Cuando el dsoUuid y el dsoType están resueltos, dispara los reports.
    // Para `site` usa el endpoint search/object que devuelve el ranking de items
    // más vistos del repositorio; para item/collection usa el endpoint single
    // por cada reportType en paralelo (forkJoin).
    effect(() => {
      const type = this.dsoType();
      const uuid = this.resolvedUuid();
      if (!type || !uuid) return;

      this.loaded.set(null);
      this.errored.set(false);

      if (type === 'site') {
        const href = this.resolvedSiteHref();
        if (!href) return;
        this.api
          .getReportsForSite$(href)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (reports) =>
              this.loaded.set(
                reports.map((r) => ({ reportType: r.reportType, report: r })),
              ),
            error: () => this.errored.set(true),
          });
        return;
      }

      const reportTypes = REPORTS_BY_DSO_TYPE[type];
      const fetches$ = reportTypes.map((rt) =>
        this.api.getReport$(uuid, rt).pipe(
          map((r) => ({ reportType: rt, report: r })),
          catchError(() => of({ reportType: rt, report: null } as LoadedReport)),
        ),
      );

      forkJoin(fetches$)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (results) => this.loaded.set(results),
          error: () => this.errored.set(true),
        });
    });
  }

  goBack(): void {
    this.location.back();
  }

  /**
   * Descubre el UUID y el href absoluto del Site root. `/api/core/sites`
   * devuelve un array (en DSpace 9 siempre hay exactamente uno). El href se
   * necesita para llamar al endpoint search/object con la URI completa del
   * Site sin asumir el host del backend.
   */
  private discoverSite$(): Observable<{ uuid: string; href: string }> {
    return this.http
      .get<{
        _embedded?: { sites?: Array<{ uuid: string; _links?: { self?: { href: string } } }> };
      }>(`${DSPACE_API_BASE}/core/sites`)
      .pipe(
        map((r) => {
          const site = r._embedded?.sites?.[0];
          return {
            uuid: site?.uuid ?? '',
            href: site?._links?.self?.href ?? '',
          };
        }),
      );
  }
}
