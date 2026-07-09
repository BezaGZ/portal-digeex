import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SessionKeepaliveService } from './session-keepalive.service';
import { AuthService } from './auth.service';

/**
 * Tests de `SessionKeepaliveService`.
 *
 * Servicio que renueva el JWT con un timer anclado a su `exp`, independiente de
 * la actividad del usuario, para que un usuario presente sin peticiones no deje
 * vencer el token. Replica el patrón `AuthService.trackTokenExpiration` de
 * dspace-angular; el corte por inactividad lo sigue decidiendo `IdleTimeoutService`.
 *
 * Ciclo 7 TDD — Sprint 11.
 */
describe('SessionKeepaliveService', () => {
  let service: SessionKeepaliveService;
  let authService: {
    getToken: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };

  const ONE_MINUTE_MS = 60_000;

  /** JWT falso con el claim `exp` (epoch en segundos) indicado. */
  function fakeJwt(expSeconds: number): string {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ exp: expSeconds }));
    return `${header}.${payload}.sig`;
  }

  /** `exp` en segundos a N minutos del ahora real. */
  function expInMinutes(min: number): number {
    return Math.floor(Date.now() / 1000) + min * 60;
  }

  beforeEach(() => {
    authService = {
      getToken: vi.fn(),
      refreshToken: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        SessionKeepaliveService,
        { provide: AuthService, useValue: authService },
      ],
    });

    service = TestBed.inject(SessionKeepaliveService);
  });

  afterEach(() => {
    service.stop();
  });

  /** Verifica que el servicio se instancie vía inyección de dependencias. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** Estado inicial */

  /** Verifica que sessionExpired arranque en false. */
  it('should start with sessionExpired false', () => {
    expect(service.sessionExpired()).toBe(false);
  });

  /** Programación del refresh */

  /** Verifica que renueve el token al alcanzar el margen (5 min) antes del exp. */
  it('should refresh the token when the refresh margin before exp is reached', fakeAsync(() => {
    authService.getToken.mockImplementation(() => fakeJwt(expInMinutes(30)));

    service.start();
    tick(25 * ONE_MINUTE_MS);

    expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    service.stop();
  }));

  /** Verifica que no renueve antes de llegar al margen. */
  it('should NOT refresh before the margin is reached', fakeAsync(() => {
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(30)));

    service.start();
    tick(24 * ONE_MINUTE_MS);

    expect(authService.refreshToken).not.toHaveBeenCalled();
    service.stop();
  }));

  /** Verifica que reprograme un nuevo refresh tras uno exitoso. */
  it('should reschedule a new refresh after a successful refresh', fakeAsync(() => {
    authService.getToken.mockImplementation(() => fakeJwt(expInMinutes(30)));

    service.start();
    tick(25 * ONE_MINUTE_MS);
    expect(authService.refreshToken).toHaveBeenCalledTimes(1);

    tick(25 * ONE_MINUTE_MS);
    expect(authService.refreshToken).toHaveBeenCalledTimes(2);
    service.stop();
  }));

  /** Verifica que stop() cancele el refresh programado. */
  it('should stop refreshing after stop() is called', fakeAsync(() => {
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(30)));

    service.start();
    service.stop();
    tick(30 * ONE_MINUTE_MS);

    expect(authService.refreshToken).not.toHaveBeenCalled();
  }));

  /** Token vencido o ausente */

  /**
   * Verifica que marque expiración sin intentar refrescar cuando el token ya
   * venció: el backend rechaza el refresh de un JWT caduco.
   */
  it('should flag the session as expired without refreshing when the token is already expired', fakeAsync(() => {
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(-1)));

    service.start();
    tick(0);

    expect(authService.refreshToken).not.toHaveBeenCalled();
    expect(service.sessionExpired()).toBe(true);
  }));

  /** Verifica que no programe ni marque expiración cuando no hay token. */
  it('should do nothing when there is no token', fakeAsync(() => {
    authService.getToken.mockReturnValue(null);

    service.start();
    tick(30 * ONE_MINUTE_MS);

    expect(authService.refreshToken).not.toHaveBeenCalled();
    expect(service.sessionExpired()).toBe(false);
  }));

  /** Verifica que marque la sesión como expirada cuando el refresh falla. */
  it('should flag the session as expired when the refresh fails', fakeAsync(() => {
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(30)));
    authService.refreshToken.mockReturnValue(throwError(() => new Error('refresh failed')));

    service.start();
    tick(25 * ONE_MINUTE_MS);

    expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    expect(service.sessionExpired()).toBe(true);
  }));

  /** Revalidación al volver la pestaña */

  /**
   * Verifica que al volver la pestaña reprograme contra el reloj real y refresque
   * si el token entró en el margen mientras la pestaña estuvo en segundo plano.
   */
  it('should refresh on tab return when the token slipped into the margin while backgrounded', fakeAsync(() => {
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(30)));
    service.start();

    // El token quedó dentro del margen mientras la pestaña estuvo en segundo plano;
    // el refresh exitoso devuelve un token nuevo de 30 min (como hace DSpace).
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(2)));
    authService.refreshToken.mockImplementation(() => {
      authService.getToken.mockReturnValue(fakeJwt(expInMinutes(30)));
      return of(undefined);
    });

    document.dispatchEvent(new Event('visibilitychange'));
    tick(0);

    expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    service.stop();
  }));

  /**
   * Verifica que al volver la pestaña con el token ya vencido marque expiración
   * sin refrescar, en vez de esperar al timer.
   */
  it('should flag expired on tab return when the token expired while backgrounded', fakeAsync(() => {
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(30)));
    service.start();

    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(-1)));
    document.dispatchEvent(new Event('visibilitychange'));
    tick(0);

    expect(authService.refreshToken).not.toHaveBeenCalled();
    expect(service.sessionExpired()).toBe(true);
    service.stop();
  }));

  /** Limpieza */

  /** Verifica que tras stop() un evento de visibilidad no dispare refresh. */
  it('should ignore visibility events after stop()', fakeAsync(() => {
    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(2)));
    service.start();
    service.stop();

    authService.getToken.mockReturnValue(fakeJwt(expInMinutes(2)));
    document.dispatchEvent(new Event('visibilitychange'));
    tick(0);

    expect(authService.refreshToken).not.toHaveBeenCalled();
  }));
});
