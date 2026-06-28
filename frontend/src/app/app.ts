import { Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';
import { SessionWarningModal } from './shared/components/session-warning-modal/session-warning-modal';
import { LoadingOverlay } from './shared/components/loading-overlay/loading-overlay';
import { IdleTimeoutService } from './core/auth/idle-timeout.service';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, SessionWarningModal, LoadingOverlay],
  templateUrl: './app.html'
})
export class App {
  private readonly idleService = inject(IdleTimeoutService);
  private readonly authService = inject(AuthService);

  constructor() {
    effect(() => {
      const authenticated = this.authService.isAuthenticated();
      untracked(() => {
        if (authenticated) {
          this.idleService.start();
        } else {
          this.idleService.stop();
        }
      });
    });
  }
}
