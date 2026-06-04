import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { DiscoveryService } from '../../../../../core/api/discovery.service';
import { Facet, SearchResult } from '../../../../../core/api/models/discovery.model';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';
import { BarChartComponent } from '../../../../stats/components/charts/bar-chart/bar-chart';
import { ChartConfig } from '../../../../stats/models/stats-dashboard.model';

/**
 * Tarjeta con la distribución de un facet de Discovery. Consume `search()`,
 * filtra el facet por `facetName` y delega el render al `<app-bar-chart>`.
 * Cuatro estados: spinner, bar-chart con datos, empty, `—` ante error.
 */
@Component({
  selector: 'app-facet-bar-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, LoadingSpinnerComponent, BarChartComponent],
  templateUrl: './facet-bar-card.html',
})
export class FacetBarCard {
  private readonly discovery = inject(DiscoveryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = input.required<string | null>();
  readonly label = input.required<string>();
  readonly facetName = input.required<string>();

  /**
   * Estado interno del search. `undefined` mientras pending, `SearchResult`
   * cuando resuelve, `null` cuando el observable falla. El template ramifica
   * sobre estos tres estados sin requerir flags separados.
   */
  private readonly result = signal<SearchResult | null | undefined>(undefined);

  readonly loading = computed(() => this.result() === undefined);
  readonly failed = computed(() => this.result() === null);

  /**
   * Facet seleccionada del response por nombre. `null` cuando la facet no
   * aparece (el dashboard puede pedir una facet que el backend no expone para
   * el scope dado) o cuando todavía no hay resultado.
   */
  private readonly facet = computed<Facet | null>(() => {
    const r = this.result();
    if (!r) return null;
    return r.facets.find((f) => f.name === this.facetName()) ?? null;
  });

  readonly isEmpty = computed(() => !this.loading() && !this.failed() && this.facet() === null);

  /**
   * Configuración del bar-chart derivada del facet. Mapea `{ label, count }`
   * de la facet al shape `{ label, value }` de `ChartDataPoint`.
   */
  readonly chartConfig = computed<ChartConfig | null>(() => {
    const f = this.facet();
    if (!f) return null;
    return {
      type: 'bar',
      title: this.label(),
      data: f.values.map((v) => ({ label: v.label, value: v.count })),
    };
  });

  constructor() {
    effect(() => {
      const scope = this.scope() ?? undefined;
      this.scope();
      this.facetName();
      this.result.set(undefined);
      this.discovery
        .search({ size: 0, scope, dsoType: 'item' })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (r) => this.result.set(r),
          error: () => this.result.set(null),
        });
    });
  }
}
