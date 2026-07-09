import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { isTokenExpired, tokenExp } from './token-expiry.util';

/**
 * Margen antes del `exp` en que se dispara el refresh proactivo (5 min). Alineado
 * con el umbral de refresco del `jwtInterceptor` para que ambos usen el mismo
 * punto; con el JWT de 30 min de DSpace, el token se renueva a los ~25.
 */
const REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * Mantiene vivo el JWT con un timer anclado a su `exp`, independiente de la
 * actividad del usuario: renueva antes de vencer para que un usuario presente
 * sin peticiones no caiga a un logout inesperado. Replica el patrón
 * `AuthService.trackTokenExpiration` de dspace-angular. La sesión inactiva la
 * sigue cerrando `IdleTimeoutService`; este servicio no decide inactividad.
 *
 * @see https://github.com/DSpace/dspace-angular (auth.service.ts, trackTokenExpiration)
 */
@Injectable({ providedIn: 'root' })
export class SessionKeepaliveService {
  private readonly authService = inject(AuthService);

  /** Se activa cuando el token no se pudo mantener vivo (caduco o refresh fallido). */
  readonly sessionExpired = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisible = () => this.evaluateOnVisible();

  /** Inicia el monitoreo: programa el primer refresh y revalida al volver la pestaña. */
  start(): void {
    this.sessionExpired.set(false);
    document.addEventListener('visibilitychange', this.onVisible);
    this.scheduleNext();
  }

  /** Detiene el monitoreo y limpia el timer y el listener. */
  stop(): void {
    this.clearTimer();
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** Programa el refresh en `exp - margen`; sin token ni `exp` legible no programa. */
  private scheduleNext(): void {
    const token = this.authService.getToken();
    if (!token) return;
    const exp = tokenExp(token);
    if (exp === null) return;

    const delay = Math.max(0, exp * 1000 - Date.now() - REFRESH_MARGIN_MS);
    this.clearTimer();
    this.timer = setTimeout(() => this.onTick(), delay);
  }

  /**
   * Al vencer el timer: un token ya caduco marca expiración sin refrescar (DSpace
   * rechaza el refresh de un JWT vencido); uno vigente se renueva y reprograma.
   */
  private onTick(): void {
    const token = this.authService.getToken();
    if (!token) return;
    if (isTokenExpired(token)) {
      this.sessionExpired.set(true);
      return;
    }

    this.authService.refreshToken().subscribe({
      next: () => this.scheduleNext(),
      error: () => this.sessionExpired.set(true),
    });
  }

  /**
   * Recalcula contra el reloj real al volver la pestaña a visible: los navegadores
   * ralentizan `setTimeout` en segundo plano, así que el token puede haber entrado
   * al margen o vencido sin que el timer llegara a disparar.
   */
  private evaluateOnVisible(): void {
    if (document.visibilityState !== 'visible') return;

    const token = this.authService.getToken();
    if (!token) {
      this.clearTimer();
      return;
    }
    if (isTokenExpired(token)) {
      this.clearTimer();
      this.sessionExpired.set(true);
      return;
    }
    this.scheduleNext();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
