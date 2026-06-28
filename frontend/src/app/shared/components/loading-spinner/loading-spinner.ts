import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { ProgressSpinner } from 'primeng/progressspinner';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [ProgressSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-center" [style.min-height]="minHeight">
      <p-progress-spinner ariaLabel="loading" />
    </div>
  `,
})
export class LoadingSpinner {
  @Input() minHeight = '200px';
}
