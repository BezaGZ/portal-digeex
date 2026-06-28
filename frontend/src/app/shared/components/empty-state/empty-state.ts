import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

/**
 * Estado "vacío" compartido entre todos los listados del portal. El layout
 * default es vertical centrado con círculo de icono, título y mensaje; el
 * modo `compact` reduce padding y elimina el círculo para encajar dentro
 * de widgets chicos sin romper la altura del card que lo contiene. El
 * `testId` se proyecta como `data-testid` al root para que el componente
 * preserve el handle que los specs preexistentes ya consultan.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (compact) {
      <div
        class="flex flex-col items-center justify-center gap-1.5 py-6 px-4 text-center"
        [attr.data-testid]="testId">
        <i [class]="icon" class="text-xl text-gray-400 dark:text-gray-500"></i>
        <h3 class="text-sm font-medium text-gray-800 dark:text-gray-100 m-0">{{ title }}</h3>
        @if (message) {
          <p class="text-xs text-gray-500 dark:text-gray-400 max-w-xs m-0">{{ message }}</p>
        }
        @if (showAction && actionLabel) {
          <p-button
            [label]="actionLabel"
            [icon]="actionIcon"
            (onClick)="action.emit()"
            [outlined]="true"
            size="small" />
        }
      </div>
    } @else {
      <div
        class="flex flex-col items-center justify-center py-12 px-6 text-center"
        [attr.data-testid]="testId">
        <div
          class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <i [class]="icon" class="text-3xl text-gray-400 dark:text-gray-500"></i>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{{ title }}</h3>
        <p class="text-gray-600 dark:text-gray-400 max-w-md mb-6">{{ message }}</p>
        @if (showAction && actionLabel) {
          <p-button
            [label]="actionLabel"
            [icon]="actionIcon"
            (onClick)="action.emit()"
            [outlined]="true" />
        }
      </div>
    }
  `,
})
export class EmptyState {
  @Input() icon = 'pi pi-inbox';
  @Input() title = 'No hay contenido';
  @Input() message = 'No se encontraron elementos para mostrar';
  @Input() showAction = false;
  @Input() actionLabel = '';
  @Input() actionIcon = 'pi pi-plus';
  /** Reduce padding y oculta el círculo del icono. Para usar en widgets chicos. */
  @Input() compact = false;
  /** Se proyecta como `data-testid` al root del componente. */
  @Input() testId?: string;

  @Output() action = new EventEmitter<void>();
}
