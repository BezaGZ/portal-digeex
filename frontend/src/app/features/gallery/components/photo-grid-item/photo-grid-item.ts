import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, signal } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-photo-grid-item',
  standalone: true,
  imports: [SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="photo-grid-item" (click)="clicked.emit()">
      @if (!loaded()) {
        <p-skeleton width="100%" height="300px" borderRadius="8px" />
      }
      <img
        [src]="src"
        [alt]="alt"
        loading="lazy"
        decoding="async"
        [class.photo-loaded]="loaded()"
        [class.photo-loading]="!loaded()"
        (load)="loaded.set(true)"
      />
    </div>
  `,
  styleUrl: './photo-grid-item.scss',
  host: { class: 'block' },
})
export class PhotoGridItemComponent {
  @Input({ required: true }) src = '';
  @Input() alt = '';
  @Output() clicked = new EventEmitter<void>();

  loaded = signal(false);
}
