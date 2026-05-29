import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IdleTimeoutService } from '../../../core/auth/idle-timeout.service';
import { AuthService } from '../../../core/auth/auth.service';

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
})
export class SessionWarningModal {
  readonly idleService = inject(IdleTimeoutService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.idleService.sessionExpired()) {
        this.onLogout();
      }
    });
  }

  /** Refresca el token y resetea el timer de inactividad. */
  onContinue(): void {
    this.authService.refreshToken().subscribe();
    this.idleService.warningVisible.set(false);
  }

  /** Cierra sesión y redirige al login. */
  onLogout(): void {
    this.idleService.stop();
    this.authService.logout().subscribe();
    this.router.navigate(['/iniciar-sesion']);
  }
}
