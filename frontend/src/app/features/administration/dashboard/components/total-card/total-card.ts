import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { DashboardStatsService } from '../../services/dashboard-stats.service';
import { LoadingSpinner } from '../../../../../shared/components/loading-spinner/loading-spinner';

/**
 * Tarjeta con el conteo total de items de un scope. Lee `totalElements` de la
 * búsqueda base compartida del dashboard (`DashboardStatsService`) y renderiza
 * tres estados: spinner pending, número formateado, `—` ante error.
 */
@Component({
  selector: 'app-total-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, LoadingSpinner],
  host: { class: 'block h-full' },
  templateUrl: './total-card.html',
})
export class TotalCard {
  private readonly dashboardStats = inject(DashboardStatsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = input.required<string | null>();
  readonly label = input.required<string>();

  /**
   * Estado interno del conteo. `undefined` mientras el observable está pendiente,
   * `number` cuando resuelve, `null` cuando el observable falla. El template
   * ramifica sobre estos tres estados sin requerir flags separados.
   */
  private readonly count = signal<number | null | undefined>(undefined);

  readonly loading = computed(() => this.count() === undefined);
  readonly failed = computed(() => this.count() === null);
  readonly value = computed(() => this.count() ?? 0);

  constructor() {
    effect(() => {
      const scope = this.scope() ?? undefined;
      this.count.set(undefined);
      this.dashboardStats
        .baseSearch$(scope)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => this.count.set(result.totalElements),
          error: () => this.count.set(null),
        });
    });
  }
}
