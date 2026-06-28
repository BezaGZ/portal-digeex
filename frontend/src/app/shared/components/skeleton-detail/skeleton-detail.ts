import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Skeleton } from 'primeng/skeleton';

@Component({
  selector: 'app-skeleton-detail',
  standalone: true,
  imports: [CommonModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container mx-auto px-6 py-8">
      <!-- Cover image skeleton -->
      <p-skeleton width="100%" height="400px" borderRadius="16px" class="mb-6" />

      <!-- Title skeleton -->
      <p-skeleton width="60%" height="2rem" class="mb-4" />

      <!-- Description skeleton -->
      <div class="mb-6">
        <p-skeleton width="100%" height="1rem" class="mb-2" />
        <p-skeleton width="95%" height="1rem" class="mb-2" />
        <p-skeleton width="85%" height="1rem" class="mb-2" />
        <p-skeleton width="70%" height="1rem" />
      </div>

      <!-- Metadata fields skeleton -->
      <div class="bg-white rounded-xl shadow-sm p-6 mb-6">
        <p-skeleton width="30%" height="1.5rem" class="mb-4" />
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="flex gap-4 mb-3">
            <p-skeleton width="180px" height="1rem" />
            <p-skeleton width="250px" height="1rem" />
          </div>
        }
      </div>

      <!-- Bitstreams skeleton -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <p-skeleton width="35%" height="1.5rem" class="mb-4" />
        @for (i of [1, 2]; track i) {
          <div class="flex items-center gap-4 p-4 border border-gray-100 rounded-lg mb-3">
            <p-skeleton shape="square" size="3rem" />
            <div class="flex-1">
              <p-skeleton width="60%" height="1rem" class="mb-2" />
              <p-skeleton width="30%" height="0.875rem" />
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class SkeletonDetail {}
