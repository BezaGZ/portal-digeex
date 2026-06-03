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
import { catchError, forkJoin, map, of } from 'rxjs';

import { DiscoveryService } from '../../../../../core/api/discovery.service';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';
import { BarChartComponent } from '../../../../stats/components/charts/bar-chart/bar-chart';
import { ChartConfig } from '../../../../stats/models/stats-dashboard.model';

/**
 * Rango etiquetado de fechas. `from` y `to` son strings `YYYY-MM-DD` que
 * el widget combina en el filtro Solr `f.dateIssued=[from TO to]`.
 */
export interface DateRange {
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

/**
 * Tarjeta con la distribución de items por rangos de fecha definidos desde
 * el frontend. Dispara una llamada a `search()` por rango con filtro
 * `dateIssued` y delega el render al `<app-bar-chart>`. Cuatro estados:
 * spinner, bar-chart con datos, empty (todos en 0), `—` ante cualquier fallo.
 */
@Component({
  selector: 'app-range-bar-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, LoadingSpinnerComponent, BarChartComponent],
  templateUrl: './range-bar-card.html',
})
export class RangeBarCard {
  private readonly discovery = inject(DiscoveryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = input.required<string | null>();
  readonly label = input.required<string>();
  readonly ranges = input.required<readonly DateRange[]>();

  /**
   * Estado interno con los conteos por rango. `undefined` mientras al menos
   * una llamada está pending, array de números cuando todas resuelven, `null`
   * cuando alguna falla.
   */
  private readonly counts = signal<number[] | null | undefined>(undefined);

  readonly loading = computed(() => this.counts() === undefined);
  readonly failed = computed(() => this.counts() === null);

  readonly isEmpty = computed(() => {
    const c = this.counts();
    return Array.isArray(c) && c.every((n) => n === 0);
  });

  readonly chartConfig = computed<ChartConfig | null>(() => {
    const c = this.counts();
    if (!Array.isArray(c)) return null;
    return {
      type: 'bar',
      title: this.label(),
      data: this.ranges().map((r, i) => ({ label: r.label, value: c[i] ?? 0 })),
    };
  });

  constructor() {
    effect(() => {
      const scope = this.scope() ?? undefined;
      const ranges = this.ranges();
      this.counts.set(undefined);
      const calls$ = ranges.map((r) =>
        this.discovery
          .search({
            size: 0,
            scope,
            filters: [
              {
                name: 'dateIssued',
                value: `[${r.from} TO ${r.to}]`,
                operator: 'equals',
              },
            ],
          })
          .pipe(map((result) => result.totalElements)),
      );
      forkJoin(calls$)
        .pipe(
          catchError(() => of(null)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((result) => this.counts.set(result));
    });
  }
}
