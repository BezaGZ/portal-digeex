import { Injectable, inject } from '@angular/core';

import { HardRedirectService } from '../navigation/hard-redirect.service';

/** Canal compartido por las pestañas del portal para eventos de sesión. */
const CHANNEL_NAME = 'digeex-session';

/** Único mensaje del canal: una pestaña cerró la sesión. */
const LOGOUT_MESSAGE = 'logout';

/**
 * Sincroniza el cierre de sesión entre pestañas vía `BroadcastChannel`: la que
 * cierra sesión anuncia y las demás purgan su sesión local al instante, en vez
 * de descubrirlo recién en su próxima petición o navegación.
 */
@Injectable({ providedIn: 'root' })
export class SessionBroadcastService {
  private readonly hardRedirect = inject(HardRedirectService);

  /** Purga local registrada por AuthService; el registro evita la inyección circular. */
  private cleanup: (() => void) | null = null;

  /** Canal nulo sin soporte del navegador: el servicio degrada a no-op. */
  private readonly channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

  constructor() {
    this.channel?.addEventListener('message', (event) => {
      if (event.data === LOGOUT_MESSAGE) {
        this.handleRemoteLogout();
      }
    });
  }

  /** Registra la purga local a ejecutar cuando otra pestaña anuncie su logout. */
  onLogout(cleanup: () => void): void {
    this.cleanup = cleanup;
  }

  /** Anuncia el cierre de sesión a las demás pestañas del portal. */
  announceLogout(): void {
    this.channel?.postMessage(LOGOUT_MESSAGE);
  }

  /**
   * Purga la sesión y recarga hacia el login solo dentro del panel; en páginas
   * públicas la purga es silenciosa para no interrumpir la lectura. No re-anuncia:
   * el emisor no recibe su propio mensaje y así no hay eco entre pestañas.
   */
  private handleRemoteLogout(): void {
    this.cleanup?.();
    if (this.hardRedirect.getCurrentRoute().startsWith('/administrador')) {
      this.hardRedirect.redirect('/iniciar-sesion');
    }
  }
}
