import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-album-skeleton',
  standalone: true,
  imports: [CardModule, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card styleClass="album-card">
      <div class="cover-container">
        <p-skeleton width="100%" height="240px" />
      </div>
      <div class="p-4">
        <p-skeleton width="50%" height="0.875rem" styleClass="mb-3" />
        <div class="flex gap-2 mb-2">
          <p-skeleton width="80px" height="1.5rem" borderRadius="9999px" />
          <p-skeleton width="100px" height="1.5rem" borderRadius="9999px" />
        </div>
        <p-skeleton width="85%" height="1.25rem" styleClass="mb-3" />
        <p-skeleton width="100%" height="2.5rem" styleClass="mb-3" />
        <p-skeleton width="100%" height="2.5rem" borderRadius="9999px" />
      </div>
    </p-card>
  `,
})
export class AlbumSkeletonComponent {}
