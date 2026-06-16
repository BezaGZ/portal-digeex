import { Component, effect, inject } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { IdleTimeoutService } from '../../../core/auth/idle-timeout.service';
import { AuthService } from '../../../core/auth/auth.service';
import { HardRedirectService } from '../../../core/navigation/hard-redirect.service';

/**
 * Modal de advertencia de sesión por inactividad.
 *
 * Se muestra automáticamente cuando el usuario lleva 25 min
 * sin actividad (signal warningVisible del IdleTimeoutService).
 *
 * Opciones:
 * - "Seguir trabajando" → refreshToken + reset del timer idle
 * - "Cerrar sesión" → logout + redirect a /login
 *
 * Si el usuario no responde y se alcanzan los 30 min,
 * ejecuta logout automático vía effect sobre sessionExpired.
 *
 */
@Component({
  selector: 'app-session-warning-modal',
  standalone: true,
  templateUrl: './session-warning-modal.html',
  imports: [DialogModule, ButtonModule],
})
export class SessionWarningModal {
  readonly idleService = inject(IdleTimeoutService);
  private readonly authService = inject(AuthService);
  private readonly hardRedirect = inject(HardRedirectService);

  constructor() {
    effect(() => {
      if (this.idleService.sessionExpired()) {
        this.onLogout();
      }
    });
  }

  /** Refresca el token y resetea el timer de inactividad. */
  onContinue(): void {
    // Si el refresh falla la sesión no se pudo extender; se trata como expirada.
    this.authService.refreshToken().subscribe({
      error: () => this.onLogout(),
    });
    this.idleService.warningVisible.set(false);
  }

  /** Cierra sesión y hace una recarga dura al login. */
  onLogout(): void {
    this.idleService.stop();
    // Recarga dura (no SPA): reinicia la app y vuelve a correr initXSRFToken,
    // dejando el token CSRF sincronizado para el próximo login. Misma recarga en
    // ambas ramas: aunque el backend falle, el usuario debe terminar en login.
    this.authService.logout().subscribe({
      next: () => this.hardRedirect.redirect('/iniciar-sesion'),
      error: () => this.hardRedirect.redirect('/iniciar-sesion'),
    });
  }
}
