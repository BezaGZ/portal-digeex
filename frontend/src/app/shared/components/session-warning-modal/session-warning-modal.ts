import { Component, effect, inject } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { IdleTimeoutService } from '../../../core/auth/idle-timeout.service';
import { SessionKeepaliveService } from '../../../core/auth/session-keepalive.service';
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
 * Ejecuta logout automático vía effect sobre sessionExpired, ya sea por
 * inactividad (idle a los 30 min) o porque el keepalive no pudo mantener
 * vivo el token (caduco o refresh fallido). Ambas fuentes cierran igual.
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
  private readonly keepaliveService = inject(SessionKeepaliveService);
  private readonly authService = inject(AuthService);
  private readonly hardRedirect = inject(HardRedirectService);

  constructor() {
    effect(() => {
      if (this.idleService.sessionExpired() || this.keepaliveService.sessionExpired()) {
        this.onLogout(true);
      }
    });
  }

  /** Refresca el token y resetea el timer de inactividad. */
  onContinue(): void {
    // Si el refresh falla la sesión no se pudo extender; se trata como expirada.
    this.authService.refreshToken().subscribe({
      error: () => this.onLogout(true),
    });
    this.idleService.warningVisible.set(false);
  }

  /**
   * Cierra sesión y hace una recarga dura al login. Con `expired` (expiración
   * automática o refresh fallido) arrastra la ruta actual en `returnUrl` para
   * que el login devuelva al usuario donde estaba; el click manual en "Cerrar
   * sesión" va limpio, como el logout de dspace-angular.
   */
  onLogout(expired = false): void {
    this.idleService.stop();
    const target = expired
      ? `/iniciar-sesion?expired=true&returnUrl=${encodeURIComponent(this.hardRedirect.getCurrentRoute())}`
      : '/iniciar-sesion';
    // Recarga dura (no SPA): reinicia la app y vuelve a correr initXSRFToken,
    // dejando el token CSRF sincronizado para el próximo login. Misma recarga en
    // ambas ramas: aunque el backend falle, el usuario debe terminar en login.
    this.authService.logout().subscribe({
      next: () => this.hardRedirect.redirect(target),
      error: () => this.hardRedirect.redirect(target),
    });
  }
}
