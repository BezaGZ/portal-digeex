import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProgressBar } from 'primeng/progressbar';
import { LoadingService } from '../../../core/loading/loading.service';

/**
 * Host único del indicador de carga: un overlay fijo a pantalla completa con
 * el fondo atenuado bloquea la interacción y la tarjeta muestra el mensaje y
 * la barra (determinada o indeterminada según `LoadingService.mode()`).
 */
@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressBar],
  template: `
    @if (loading.active()) {
      <div
        data-testid="loading-overlay"
        role="status"
        aria-live="polite"
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      >
        <div
          class="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl bg-surface px-6 py-5
                 shadow-xl"
        >
          <span
            class="text-center font-medium text-[var(--color-text-primary)]"
            data-testid="loading-message"
          >
            {{ loading.message() }}
          </span>
          @if (loading.mode() === 'determinate') {
            <p-progressBar
              class="w-full"
              [value]="loading.percent()"
              [showValue]="true"
              unit="%"
              data-testid="loading-determinate"
            />
          } @else {
            <p-progressBar class="w-full" mode="indeterminate" data-testid="loading-indeterminate" />
          }
        </div>
      </div>
    }
  `,
})
export class LoadingOverlay {
  protected readonly loading = inject(LoadingService);
}
