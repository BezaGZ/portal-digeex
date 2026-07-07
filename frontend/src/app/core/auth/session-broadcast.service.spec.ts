import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SessionBroadcastService } from './session-broadcast.service';
import { HardRedirectService } from '../navigation/hard-redirect.service';

/**
 * Tests de `SessionBroadcastService`.
 *
 * Sincroniza el cierre de sesión entre pestañas vía `BroadcastChannel`
 * (`digeex-session`): la pestaña que cierra sesión anuncia y las demás purgan
 * su sesión local, recargando hacia el login solo si están dentro del panel.
 * Sin soporte del canal el servicio degrada a no-op (comportamiento previo).
 *
 * Ciclo 67 TDD — Sprint 10.
 */
describe('SessionBroadcastService', () => {
  let redirectFn: ReturnType<typeof vi.fn>;
  let currentRouteFn: ReturnType<typeof vi.fn>;
  let peer: BroadcastChannel;

  /** Espera hasta que la condición se cumpla: la entrega de BroadcastChannel es asíncrona y sin plazo fijo. */
  async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  beforeEach(() => {
    redirectFn = vi.fn();
    currentRouteFn = vi.fn().mockReturnValue('/administrador/recursos');

    TestBed.configureTestingModule({
      providers: [
        SessionBroadcastService,
        {
          provide: HardRedirectService,
          useValue: { redirect: redirectFn, getCurrentRoute: currentRouteFn },
        },
      ],
    });

    peer = new BroadcastChannel('digeex-session');
  });

  afterEach(() => {
    peer.close();
    vi.unstubAllGlobals();
  });

  /** Verifica que announceLogout publique el aviso en el canal digeex-session. */
  it('should publish the logout message on the shared channel', async () => {
    const service = TestBed.inject(SessionBroadcastService);
    const received = new Promise((resolve) => {
      peer.addEventListener('message', (event) => resolve(event.data));
    });

    service.announceLogout();

    expect(await received).toBe('logout');
  });

  /** Verifica que al recibir el aviso se ejecute la purga registrada. */
  it('should run the registered cleanup when a logout message arrives', async () => {
    const service = TestBed.inject(SessionBroadcastService);
    const cleanup = vi.fn();
    service.onLogout(cleanup);

    peer.postMessage('logout');
    await waitFor(() => cleanup.mock.calls.length > 0);

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  /** Verifica que dentro del panel el aviso recargue hacia el login. */
  it('should hard-redirect to the login when the logout arrives inside the admin panel', async () => {
    TestBed.inject(SessionBroadcastService);
    currentRouteFn.mockReturnValue('/administrador/envios');

    peer.postMessage('logout');
    await waitFor(() => redirectFn.mock.calls.length > 0);

    expect(redirectFn).toHaveBeenCalledWith('/iniciar-sesion');
  });

  /**
   * Verifica que en una página pública el aviso purgue sin navegar.
   * Un visitante leyendo un documento no debe ser interrumpido por un logout ajeno.
   */
  it('should NOT navigate when the logout arrives on a public page', async () => {
    const service = TestBed.inject(SessionBroadcastService);
    const cleanup = vi.fn();
    service.onLogout(cleanup);
    currentRouteFn.mockReturnValue('/programas/abc');

    peer.postMessage('logout');
    await waitFor(() => cleanup.mock.calls.length > 0);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(redirectFn).not.toHaveBeenCalled();
  });

  /** Verifica que sin soporte de BroadcastChannel el servicio quede en no-op sin tronar. */
  it('should degrade to a no-op when BroadcastChannel is not supported', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    const service = TestBed.inject(SessionBroadcastService);

    expect(() => service.announceLogout()).not.toThrow();
  });
});
