import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { Skeleton } from 'primeng/skeleton';

@Component({
  selector: 'app-skeleton-card',
  standalone: true,
  imports: [Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 border border-gray-100"
    >
      <div class="flex items-center gap-3 mb-4">
        <p-skeleton shape="circle" size="3rem" />
        <p-skeleton width="60%" height="1.5rem" />
      </div>

      <p-skeleton width="100%" height="1rem" class="mb-2" />
      <p-skeleton width="90%" height="1rem" class="mb-2" />
      <p-skeleton width="70%" height="1rem" />
    </div>
  `,
})
export class SkeletonCard {
  @Input() count = 1;
}
