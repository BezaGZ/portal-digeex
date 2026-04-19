import { Injectable, signal } from '@angular/core';

/**
 * Servicio que rastrea la inactividad del usuario y emite
 * señales de advertencia y expiración de sesión.
 *
 * @see DT-02 (sesión 30 min idle con refresh por actividad)
 * @see DT-03 (modal de aviso a los 25 min)
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  readonly warningVisible = signal(false);
  readonly sessionExpired = signal(false);
  readonly lastActivity = signal(0);

  /** Inicia el monitoreo de actividad del usuario. */
  start(): void {

  }

  /** Detiene el monitoreo y limpia los listeners. */
  stop(): void {
  
  }
}
