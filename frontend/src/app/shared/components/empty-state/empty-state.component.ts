import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div
        class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4"
      >
        <i [class]="icon" class="text-3xl text-gray-400"></i>
      </div>

      <h3 class="text-lg font-medium text-gray-900 mb-2">{{ title }}</h3>

      <p class="text-gray-600 max-w-md mb-6">{{ message }}</p>

      @if (showAction && actionLabel) {
        <p-button
          [label]="actionLabel"
          [icon]="actionIcon"
          (onClick)="action.emit()"
          [outlined]="true"
        />
      }
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = 'pi pi-inbox';
  @Input() title = 'No hay contenido';
  @Input() message = 'No se encontraron elementos para mostrar';
  @Input() showAction = false;
  @Input() actionLabel = '';
  @Input() actionIcon = 'pi pi-plus';

  @Output() action = new EventEmitter<void>();
}
