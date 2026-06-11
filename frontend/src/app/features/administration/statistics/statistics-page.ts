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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { StatisticsApiService } from '../../../core/api/statistics-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { DSPACE_API_BASE } from '../../../core/api/dspace-rest.util';
import {
  LoadedReport,
  REPORTS_BY_DSO_TYPE,
  UsageReportDsoType,
} from '../../../core/api/models/usage-report.model';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ExportStatisticsButton } from '../../../shared/components/export-statistics-button/export-statistics-button.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { UsageReportTable } from './components/usage-report-table/usage-report-table';
import { MonthlyVisitsGrid } from './components/monthly-visits-grid/monthly-visits-grid';

const DSO_TYPE_TITLES: Readonly<Record<UsageReportDsoType, string>> = {
  site: 'Estadísticas del repositorio',
  item: 'Estadísticas del recurso',
  collection: 'Estadísticas del programa',
};

/** Título del PDF para scope=site: el Site de DSpace no tiene nombre curado. */
const SITE_EXPORT_TITLE = 'Repositorio institucional DIGEEX';

/**
 * Componente contenedor para visualizar las estadísticas de un objeto de DSpace (DSO).
 * Resuelve el identificador único (`dsoUuid`) según el tipo de objeto (`dsoType`), ejecuta
 * en paralelo las consultas de los reportes configurados en `REPORTS_BY_DSO_TYPE` y almacena
 * los resultados para su visualización.
 */
@Component({
  selector: 'app-statistics-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    FormsModule,
    RouterModule,
    SelectModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ExportStatisticsButton,
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
  private readonly breadcrumb = inject(BreadcrumbService);

  /** dsoType viene de `route.data['dsoType']` declarado en `app.routes.ts`. */
  readonly dsoType = toSignal(
    this.route.data.pipe(map((d) => d['dsoType'] as UsageReportDsoType)),
  );

  /** dsoUuid viene de `route.params['uuid']` excepto cuando dsoType=site. */
  readonly routeUuid = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('uuid') ?? '')),
  );

  readonly resolvedUuid = signal<string | null>(null);
  /** URL de autoreferencia (`self.href`) del sitio raíz resuelto. */
  readonly resolvedSiteHref = signal<string | null>(null);
  readonly loaded = signal<LoadedReport[] | null>(null);
  readonly errored = signal(false);

  readonly title = computed(() => {
    const t = this.dsoType();
    return t ? DSO_TYPE_TITLES[t] : 'Estadísticas';
  });

  /** Nombre real del recurso, consultado al backend (null si la consulta falló). */
  readonly dsoName = signal<string | null>(null);
  /** Handle del recurso para el footer del PDF (null si falló o no aplica). */
  readonly dsoHandle = signal<string | null>(null);

  /**
   * Título que identifica el recurso en el PDF exportado: etiqueta fija para
   * site (el Site de DSpace no tiene nombre curado), nombre real para item y
   * programa, y el título genérico como respaldo si la consulta falló.
   */
  readonly dsoTitle = computed(() => {
    if (this.dsoType() === 'site') return SITE_EXPORT_TITLE;
    return this.dsoName() ?? this.title();
  });

  readonly loading = computed(() => this.loaded() === null && !this.errored());

  /** Cantidad de meses de historial para el filtro de visitas. */
  readonly monthsBack = signal<number>(12);

  /** Opciones del dropdown de ventana mensual. */
  readonly monthsBackOptions: { label: string; value: number }[] = [
    { label: 'Últimos 3 meses', value: 3 },
    { label: 'Últimos 6 meses', value: 6 },
    { label: 'Últimos 12 meses', value: 12 },
    { label: 'Últimos 24 meses', value: 24 },
    { label: 'Últimos 60 meses', value: 60 },
  ];

  constructor() {
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

    // Nombre y handle reales del recurso para el PDF. Si la consulta falla,
    // dsoTitle cae al título genérico y el PDF sale igual, solo menos específico.
    effect(() => {
      const type = this.dsoType();
      const uuid = this.resolvedUuid();
      if (!type || !uuid || type === 'site') return;

      const segment = type === 'item' ? 'items' : 'collections';
      this.http
        .get<{ name?: string; handle?: string }>(`${DSPACE_API_BASE}/core/${segment}/${uuid}`)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => of(null)),
        )
        .subscribe((dso) => {
          this.dsoName.set(dso?.name ?? null);
          this.dsoHandle.set(dso?.handle ?? null);
        });
    });

    /**
     * Trail dinámico para los scopes con recurso concreto; site no publica
     * porque su ruta ya declara `data.breadcrumb`. Publica con etiqueta
     * genérica mientras el nombre resuelve y republica al llegar.
     */
    effect(() => {
      const type = this.dsoType();
      if (!type || type === 'site') return;
      const generic = type === 'collection' ? 'Programa' : 'Recurso';
      this.breadcrumb.setTrail([
        { label: 'Estadísticas de uso', routerLink: '/administrador/uso' },
        { label: this.dsoName() ?? generic },
      ]);
    });
  }

  goBack(): void {
    this.location.back();
  }

  /**
   * Consulta el endpoint `/api/core/sites` para obtener el UUID y la URL
   * de autoreferencia (`self.href`) del sitio raíz (Site root).
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
