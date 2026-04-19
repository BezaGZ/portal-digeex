import { Injectable, signal } from '@angular/core';

/** Tiempo en ms para mostrar el modal de advertencia (25 minutos). */
/** TODO: revertir a 25 * 60_000 después de prueba visual */
const WARNING_MS = 20_000;

/** Tiempo en ms para expirar la sesión (30 minutos). */
/** TODO: revertir a 30 * 60_000 después de prueba visual */
const TIMEOUT_MS = 30_000;

/** Eventos DOM que se consideran actividad del usuario. */
const ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'scroll'] as const;

/**
 * Servicio que rastrea la inactividad del usuario y emite
 * señales de advertencia y expiración de sesión.
 *
 * Escucha eventos DOM (click, keydown, mousemove, scroll)
 * para detectar actividad. Si el usuario no interactúa:
 * - A los 25 min → `warningVisible` se activa (modal)
 * - A los 30 min → `sessionExpired` se activa (logout)
 *
 * Cualquier interacción resetea los timers y oculta el warning.
 *
 * @see DT-02 (sesión 30 min idle con refresh por actividad)
 * @see DT-03 (modal de aviso a los 25 min)
 *
 * Ciclo 3 TDD — Sprint 5
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  readonly warningVisible = signal(false);
  readonly sessionExpired = signal(false);
  readonly lastActivity = signal(0);

  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onActivity = () => this.handleActivity();

  /** Inicia el monitoreo de actividad del usuario. */
  start(): void {
    this.lastActivity.set(Date.now());
    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, this.onActivity);
    });
    this.startTimers();
  }

  /** Detiene el monitoreo y limpia los listeners. */
  stop(): void {
    ACTIVITY_EVENTS.forEach((event) => {
      document.removeEventListener(event, this.onActivity);
    });
    this.clearTimers();
    this.warningVisible.set(false);
    this.sessionExpired.set(false);
  }

  /** Registra la actividad, oculta el warning y reinicia los timers. */
  private handleActivity(): void {
    if (this.sessionExpired()) { return; }

    this.lastActivity.set(Date.now());
    this.warningVisible.set(false);
    this.clearTimers();
    this.startTimers();
  }

  /** Programa los setTimeout de warning (25 min) y timeout (30 min). */
  private startTimers(): void {
    this.warningTimer = setTimeout(() => {
      this.warningVisible.set(true);
    }, WARNING_MS);

    this.timeoutTimer = setTimeout(() => {
      this.sessionExpired.set(true);
    }, TIMEOUT_MS);
  }

  /** Limpia ambos timers si existen. */
  private clearTimers(): void {
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}
