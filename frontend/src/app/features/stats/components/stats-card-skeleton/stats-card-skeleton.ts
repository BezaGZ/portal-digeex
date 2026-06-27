import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';

/**
 * Placeholder de carga de `app-stats-card`: espeja su layout (icono circular,
 * título, descripción, fecha y botón) con `p-skeleton` para que la grilla de
 * Estadística use el mismo skeleton que el resto del lado público.
 */
@Component({
  selector: 'app-stats-card-skeleton',
  standalone: true,
  imports: [CardModule, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card styleClass="h-full digeex-stats-card">
      <div class="flex flex-col items-center text-center gap-2 px-2 py-3">
        <p-skeleton shape="circle" size="3.5rem" styleClass="mb-1" />
        <p-skeleton width="70%" height="1.25rem" />
        <p-skeleton width="90%" height="0.75rem" />
        <p-skeleton width="80%" height="0.75rem" />
        <p-skeleton width="45%" height="0.75rem" styleClass="mt-1" />
        <p-skeleton width="6rem" height="2rem" borderRadius="9999px" styleClass="mt-2" />
      </div>
    </p-card>
  `,
})
export class StatsCardSkeletonComponent {}
