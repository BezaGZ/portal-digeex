import { Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';
import { SessionWarningModal } from './shared/components/session-warning-modal/session-warning-modal';
import { IdleTimeoutService } from './core/auth/idle-timeout.service';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, SessionWarningModal],
  templateUrl: './app.html'
})
export class App {
  private readonly idleService = inject(IdleTimeoutService);
  private readonly authService = inject(AuthService);

  constructor() {
    /**
     * Restaura la sesión al iniciar la app.
     * GET /api/authn/status siembra el token CSRF y,
     * si hay sesión activa, restaura el usuario.
     */
    this.authService.restoreSession().subscribe();

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
