import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';

import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { BundleApiService } from '../../../core/api/bundle-api.service';
import { StatisticsTrackingService } from '../../../core/api/statistics-tracking.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { ExcelReaderService } from '../services/excel-reader.service';
import { getStatsRenderer } from '../stats-dataset-registry';
import { StatsRenderer } from '../renderers/stats-renderer.interface';
import { StatsDashboard, FilterConfig } from '../models/stats-dashboard.model';
import { ParsedExcel } from '../models/parsed-excel.model';
import { Item } from '../../../core/api/models/item.model';
import { ChartSectionComponent } from '../components/charts/chart-section/chart-section';
import { StatsFiltersComponent } from '../components/stats-filters/stats-filters';
import { ChartSectionSkeletonComponent } from '../components/charts/chart-section-skeleton/chart-section-skeleton';
import { EmptyStateComponent } from '../../../shared';
import { IsoDateLocalPipe } from '../../../core/i18n/iso-date-local.pipe';

/** Estados terminales no exitosos del detalle; cada uno tiene su mensaje en la UI. */
export type StatsDetailError = 'not-found' | 'unsupported' | 'network';

/**
 * Detalle público de un item Estadística en
 * `/estadistica/:uuid/item/:itemUuid`. El `:uuid` es la colección padre y
 * `:itemUuid` el item específico. Orquesta la carga del item, la resolución
 * del renderer del registry por `digeex.statsDataset`, la descarga lazy del
 * Excel y la construcción del dashboard con sus filtros. Cuatro modos de
 * error explícitos (item no existe, dataset no registrado, columna PII,
 * fallo de red) con empty states distintos para que el visitante entienda
 * qué pasó.
 */
@Component({
  selector: 'app-stats-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ButtonModule,
    ChartSectionComponent,
    StatsFiltersComponent,
    ChartSectionSkeletonComponent,
    EmptyStateComponent,
    IsoDateLocalPipe,
  ],
  templateUrl: './stats-detail.html',
})
export class StatsDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dspaceApi = inject(DSpaceApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly excelReader = inject(ExcelReaderService);
  private readonly breadcrumbService = inject(BreadcrumbService);
  private readonly tracking = inject(StatisticsTrackingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly item = signal<Item | null>(null);
  readonly dashboard = signal<StatsDashboard | null>(null);
  readonly filters = signal<readonly FilterConfig[]>([]);
  readonly isLoading = signal(true);
  readonly errorState = signal<StatsDetailError | null>(null);

  private renderer: StatsRenderer | null = null;

  /** UUID de la colección padre, leído del route param `:uuid`. */
  private collectionUuid: string | null = null;

  ngOnInit(): void {
    this.collectionUuid = (this.route.snapshot.params['uuid'] as string | undefined) ?? null;
    const itemUuid = this.route.snapshot.params['itemUuid'];
    if (!itemUuid) {
      this.fail('not-found');
      return;
    }
    this.load(itemUuid);
  }

  /** Vuelve al listado de la colección padre si el UUID está presente; si no, al raíz. */
  goBack(): void {
    if (this.collectionUuid) {
      this.router.navigate(['/estadistica', this.collectionUuid]);
      return;
    }
    this.router.navigate(['/estadistica']);
  }

  /**
   * Al cambiar los filtros activos, el renderer reconstruye el dashboard con
   * las filas que matchean. Aplica también cuando el usuario limpia (mapa
   * vacío) — el renderer devuelve el dashboard sin filtrar.
   */
  onFiltersChange(active: Record<string, string | string[]>): void {
    const current = this.dashboard();
    if (!current || !this.renderer) return;
    this.dashboard.set(this.renderer.applyFilters(current, active));
  }

  /** Permite reintentar tras un error de red sin recargar la página completa. */
  retry(): void {
    const itemUuid = this.route.snapshot.params['itemUuid'];
    if (!itemUuid) return;
    this.errorState.set(null);
    this.load(itemUuid);
  }

  private load(uuid: string): void {
    this.isLoading.set(true);
    this.dspaceApi
      .getItem(uuid)
      .pipe(
        tap((item) => {
          this.item.set(item);
          this.updateBreadcrumb(item);
          // Registra la visita al item en Solr Statistics (best-effort).
          this.tracking
            .trackView$(item.uuid, 'item')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
        }),
        switchMap((item) => this.resolveRendererAndExcel$(item)),
      )
      .subscribe({
        next: (parsed) => this.applyParsedExcel(parsed),
        error: (err) => this.classifyError(err),
      });
  }

  /**
   * Resuelve el `Type<StatsRenderer>` del registry, instancia el renderer
   * vía injector, busca el bundle ORIGINAL del item y descarga + parsea el
   * primer bitstream (Stats archiva un único Excel por item). Si el dataset
   * no está registrado o el item no tiene ORIGINAL con bitstream, falla con
   * el error específico.
   */
  private resolveRendererAndExcel$(item: Item): Observable<ParsedExcel> {
    const datasetKey = item.metadata?.['digeex.statsDataset']?.[0]?.value;
    const RendererClass = getStatsRenderer(datasetKey);
    if (!RendererClass) {
      return throwError(() => new UnsupportedDatasetError());
    }
    this.renderer = this.injector.get(RendererClass);
    return this.bundleApi.listForItem(item.uuid, 'bitstreams').pipe(
      switchMap((response) => {
        const original = (response._embedded?.bundles ?? []).find(
          (b) => b.name === 'ORIGINAL',
        );
        if (!original) {
          return throwError(() => new Error('ORIGINAL bundle no encontrado'));
        }
        const bitstream = original._embedded?.bitstreams?._embedded?.bitstreams?.[0];
        if (!bitstream) {
          return throwError(() => new Error('El bundle ORIGINAL no tiene bitstreams'));
        }
        return this.excelReader.getParsedExcel$(item.uuid, bitstream.uuid);
      }),
    );
  }

  /**
   * Llama `renderer.parse` con el Excel descargado y publica el dashboard.
   * `parse` es resiliente por contrato (nunca lanza), así que aquí no hay
   * try/catch: si el Excel no calzaba, llega un dashboard sin secciones y
   * la vista suprime el panel sin mostrar mensaje de error.
   */
  private applyParsedExcel(parsed: ParsedExcel): void {
    if (!this.renderer) return;
    const dashboard = this.renderer.parse(parsed);
    this.dashboard.set(dashboard);
    this.filters.set(this.renderer.getFilters(dashboard));
    this.isLoading.set(false);
    // Chart.js mide su canvas con el tamaño del container al primer render;
    // si el container todavía estaba colapsado por el `@if (isLoading())`,
    // el canvas queda descentrado hasta que algo dispara un resize. Forzar
    // un `resize` post-paint corrige el alineamiento de todos los charts
    // sin esperar interacción del usuario.
    if (typeof window !== 'undefined') {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    }
  }

  /**
   * Publica el trail con el `dc.title` real del item para que el breadcrumb
   * global muestre el título en lugar del literal de `route.data`. Si la
   * colección padre está presente, la entrada "Estadística" linkea al
   * listado de esa colección; si no, al raíz. Mismo patrón que
   * `DocumentDetailComponent`.
   */
  private updateBreadcrumb(item: Item): void {
    const title = item.metadata?.['dc.title']?.[0]?.value ?? 'Detalle';
    const listingLink = this.collectionUuid
      ? `/estadistica/${this.collectionUuid}`
      : '/estadistica';
    this.breadcrumbService.setTrail([
      { label: 'Estadística', routerLink: listingLink },
      { label: title },
    ]);
  }

  private classifyError(err: unknown): void {
    if (err instanceof UnsupportedDatasetError) {
      this.fail('unsupported');
      return;
    }
    if (err instanceof HttpErrorResponse && err.status === 404) {
      this.fail('not-found');
      return;
    }
    this.fail('network');
  }

  private fail(state: StatsDetailError): void {
    this.errorState.set(state);
    this.isLoading.set(false);
  }
}

class UnsupportedDatasetError extends Error {
  constructor() {
    super('Dataset no registrado en stats-dataset-registry');
  }
}
