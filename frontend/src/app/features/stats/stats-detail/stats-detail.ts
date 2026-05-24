import { ChangeDetectionStrategy, Component, Injector, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';

import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { BundleApiService } from '../../../core/api/bundle-api.service';
import { ExcelReaderService } from '../services/excel-reader.service';
import { getStatsRenderer } from '../stats-dataset-registry';
import { StatsRenderer } from '../renderers/stats-renderer.interface';
import { StatsDashboard, FilterConfig } from '../models/stats-dashboard.model';
import { ParsedExcel } from '../models/parsed-excel.model';
import { Item } from '../../../core/api/models/item.model';
import { ChartSectionComponent } from '../components/charts/chart-section/chart-section';
import { StatsFiltersComponent } from '../components/stats-filters/stats-filters';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared';

/** Estados terminales no exitosos del detalle; cada uno tiene su mensaje en la UI. */
export type StatsDetailError = 'not-found' | 'unsupported' | 'network';

/**
 * Detalle público de un item Estadística en `/estadistica/:uuid`. Orquesta
 * la carga del item, la resolución del renderer del registry por
 * `digeex.statsDataset`, la descarga lazy del Excel y la construcción del
 * dashboard con sus filtros. Cuatro modos de error explícitos (item no
 * existe, dataset no registrado, columna PII, fallo de red) con empty
 * states distintos para que el visitante entienda qué pasó.
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
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './stats-detail.html',
})
export class StatsDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dspaceApi = inject(DSpaceApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly excelReader = inject(ExcelReaderService);
  private readonly injector = inject(Injector);

  readonly item = signal<Item | null>(null);
  readonly dashboard = signal<StatsDashboard | null>(null);
  readonly filters = signal<readonly FilterConfig[]>([]);
  readonly isLoading = signal(true);
  readonly errorState = signal<StatsDetailError | null>(null);

  private renderer: StatsRenderer | null = null;

  ngOnInit(): void {
    const uuid = this.route.snapshot.params['uuid'];
    if (!uuid) {
      this.fail('not-found');
      return;
    }
    this.load(uuid);
  }

  /** Vuelve al listado público. */
  goBack(): void {
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
    const uuid = this.route.snapshot.params['uuid'];
    if (!uuid) return;
    this.errorState.set(null);
    this.load(uuid);
  }

  private load(uuid: string): void {
    this.isLoading.set(true);
    this.dspaceApi
      .getItem(uuid)
      .pipe(
        tap((item) => this.item.set(item)),
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

    return this.bundleApi.listForItem(item.uuid).pipe(
      switchMap((response) => {
        const original = (response._embedded?.bundles ?? []).find(
          (b) => b.name === 'ORIGINAL',
        );
        if (!original) {
          return throwError(() => new Error('ORIGINAL bundle no encontrado'));
        }
        return this.bundleApi.listBitstreams(original.uuid, 0, 1);
      }),
      switchMap((page) => {
        const bitstream = page.items[0];
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
