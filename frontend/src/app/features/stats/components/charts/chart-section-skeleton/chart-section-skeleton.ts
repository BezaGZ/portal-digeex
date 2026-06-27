import { Component, ChangeDetectionStrategy } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

/**
 * Placeholder de carga de `app-chart-section`: espeja su contenedor (título y
 * área de gráfica) con `p-skeleton` para que el detalle de Estadística use el
 * mismo skeleton que el resto del lado público.
 */
@Component({
  selector: 'app-chart-section-skeleton',
  standalone: true,
  imports: [SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="bg-[var(--color-surface)] p-5 sm:p-6 flex flex-col gap-4 border-b border-r border-[var(--color-border)] h-full"
    >
      <p-skeleton width="40%" height="0.875rem" />
      <p-skeleton width="100%" height="240px" borderRadius="8px" />
    </article>
  `,
})
export class ChartSectionSkeletonComponent {}
