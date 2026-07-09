import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient, HttpContext, HttpXsrfTokenExtractor } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { jwtInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { SKIP_BEARER } from './skip-bearer.context';
import { HardRedirectService } from '../navigation/hard-redirect.service';

/**
 * Tests para jwtInterceptor.
 *
 * Interceptor HTTP que adjunta el header Authorization: Bearer, gestiona el
 * refresh anticipado del JWT, y redirige al login solo cuando un 401 llega con
 * el token ya vencido localmente.
 *
 * Ciclo 2 TDD — Sprint 5. Ajustado en Ciclos 23, 41, 49 y 66 (Sprint 10) y en los
 * Ciclos 9 y 10 (Sprint 11): el dedup del refresh se movió a AuthService
 * (single-flight) y el reintento reaplica el token CSRF vigente.
 */
describe('jwtInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: AuthService;
  let redirectFn: ReturnType<typeof vi.fn>;
  let xsrfExtractor: { getToken: ReturnType<typeof vi.fn> };

  /** JWT de prueba: vencido (exp en el pasado) y válido (exp lejano). */
  const EXPIRED_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.sig';
  const VALID_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig';

  /** Setup */

  beforeEach(() => {
    redirectFn = vi.fn();
    xsrfExtractor = { getToken: vi.fn().mockReturnValue(null) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
        {
          provide: HardRedirectService,
          useValue: { redirect: redirectFn, getCurrentRoute: () => '/administrador/envios/abc' },
        },
        { provide: HttpXsrfTokenExtractor, useValue: xsrfExtractor },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Con token */

  describe('with token', () => {
    /** Verifica que adjunte Authorization: Bearer en GET cuando hay JWT. */
    it('should attach Bearer token on GET requests', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('my-jwt-token');

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      expect(req.request.headers.get('Authorization')).toBe('Bearer my-jwt-token');
      req.flush({});

      await promise;
    });

    /**
     * Verifica que una petición marcada con SKIP_BEARER salga sin Authorization.
     * El login con credenciales no viaja con el Bearer viejo: DSpace lo trataría como refresh.
     */
    it('should NOT attach the Bearer token when the request opts out via SKIP_BEARER', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('my-jwt-token');

      const promise = new Promise((resolve, reject) => {
        httpClient
          .post('/server/api/authn/login', 'user=x&password=y', {
            context: new HttpContext().set(SKIP_BEARER, true),
          })
          .subscribe({ next: resolve, error: reject });
      });

      const req = httpMock.expectOne('/server/api/authn/login');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});

      await promise;
    });

    /** Verifica que adjunte Authorization: Bearer en POST cuando hay JWT. */
    it('should attach Bearer token on POST requests', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('my-jwt-token');

      const promise = new Promise((resolve, reject) => {
        httpClient.post('/server/api/authn/logout', null).subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/authn/logout');
      expect(req.request.headers.get('Authorization')).toBe('Bearer my-jwt-token');
      req.flush({});

      await promise;
    });
  });

  /** Sin token */

  describe('without token', () => {
    /** Verifica que NO adjunte Authorization cuando no hay JWT. */
    it('should NOT attach Authorization header when no token', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue(null);

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});

      await promise;
    });
  });

  /** Endpoints públicos */

  describe('public endpoints', () => {
    /**
     * Verifica que peticiones a `/eperson/registrations` NO lleven Bearer
     * aunque el AuthService tenga un token. El endpoint es anónimo en
     * DSpace 9 (`@PreAuthorize("permitAll()")` sobre `findByToken`), pero
     * el filtro de seguridad valida el JWT antes de llegar al endpoint y
     * rechaza con 401 cuando el token está stale o expirado, lo que dispararía
     * el redirect al login. Excluir el path del Bearer mantiene la pantalla de
     * reset utilizable desde una pestaña con sesión obsoleta.
     */
    it('should NOT attach Bearer on /eperson/registrations requests', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('stale-jwt');

      const promise = new Promise<void>((resolve, reject) => {
        httpClient
          .get('/server/api/eperson/registrations/search/findByToken')
          .subscribe({ next: () => resolve(), error: reject });
      });

      const req = httpMock.expectOne(
        '/server/api/eperson/registrations/search/findByToken',
      );
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});

      await promise;
    });

    /**
     * Verifica que el POST a `/statistics/viewevents` NO lleve Bearer aunque
     * el AuthService tenga un token. DSpace filtra hits autenticados como
     * admin para no inflar los reportes con tráfico de administración; el
     * portal registra visitas siempre como anónimo aunque el visitante esté
     * logueado en otro tab. Ver `xsrf.interceptor` que agrega `X-XSRF-TOKEN`
     * y `withCredentials` automáticamente.
     */
    it('should NOT attach Bearer on /statistics/viewevents requests', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('admin-jwt');

      const promise = new Promise<void>((resolve, reject) => {
        httpClient
          .post('/server/api/statistics/viewevents', { targetId: 'uuid-1', targetType: 'item' })
          .subscribe({ next: () => resolve(), error: reject });
      });

      const req = httpMock.expectOne('/server/api/statistics/viewevents');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});

      await promise;
    });
  });

  /** Refresh automático */

  describe('automatic refresh', () => {
    /**
     * Helper: genera un JWT falso con un claim exp específico.
     * El payload es base64 del JSON con el exp.
     */
    function fakeJwt(expTimestamp: number): string {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ eid: 'user-001', exp: expTimestamp }));
      return `${header}.${payload}.fake-signature`;
    }

    /** Verifica que haga refresh cuando el token expira en menos de 5 minutos. */
    it('should refresh token when exp is less than 5 minutes away', async () => {
      const expiringSoon = Math.floor(Date.now() / 1000) + 200;
      vi.spyOn(authService, 'getToken').mockReturnValue(fakeJwt(expiringSoon));
      vi.spyOn(authService, 'refreshToken').mockReturnValue(
        new (await import('rxjs')).Observable((subscriber) => {
          subscriber.next(undefined);
          subscriber.complete();
        }),
      );

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush({});

      await promise;
      expect(authService.refreshToken).toHaveBeenCalled();
    });

    /** Verifica que NO haga refresh cuando el token tiene más de 5 minutos de vida. */
    it('should NOT refresh token when exp is more than 5 minutes away', async () => {
      const expiresLater = Math.floor(Date.now() / 1000) + 600;
      vi.spyOn(authService, 'getToken').mockReturnValue(fakeJwt(expiresLater));
      vi.spyOn(authService, 'refreshToken');

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush({});

      await promise;
      expect(authService.refreshToken).not.toHaveBeenCalled();
    });

    /**
     * Verifica que tres peticiones concurrentes por vencer compartan un solo POST
     * de refresh. El single-flight vive en `AuthService.refreshToken()`, así que el
     * interceptor delega sin deduplicar; `expectOne` falla si hubiera más de un POST.
     */
    it('should coalesce concurrent refreshes into a single /authn/login', async () => {
      const expiringSoon = Math.floor(Date.now() / 1000) + 200;
      vi.spyOn(authService, 'getToken').mockReturnValue(fakeJwt(expiringSoon));

      const promises = [
        new Promise((resolve, reject) => {
          httpClient.get('/server/api/core/communities').subscribe({ next: resolve, error: reject });
        }),
        new Promise((resolve, reject) => {
          httpClient.get('/server/api/core/collections').subscribe({ next: resolve, error: reject });
        }),
        new Promise((resolve, reject) => {
          httpClient.get('/server/api/core/items').subscribe({ next: resolve, error: reject });
        }),
      ];

      const refreshReq = httpMock.expectOne('/server/api/authn/login');
      refreshReq.flush(null, { headers: { Authorization: 'Bearer fresh-shared' } });

      httpMock.expectOne('/server/api/core/communities').flush({});
      httpMock.expectOne('/server/api/core/collections').flush({});
      httpMock.expectOne('/server/api/core/items').flush({});

      await Promise.all(promises);
    });

    /**
     * Verifica que tras el refresh, la petición se reenvíe
     * con el token renovado (no con el token viejo).
     */
    it('should retry original request with new token after refresh', async () => {
      const { Subject } = await import('rxjs');
      const expiringSoon = Math.floor(Date.now() / 1000) + 200;
      const refreshedToken = 'refreshed-token-789';

      vi.spyOn(authService, 'getToken')
        .mockReturnValueOnce(fakeJwt(expiringSoon))
        .mockReturnValue(refreshedToken);

      const refreshSubject = new Subject<void>();
      vi.spyOn(authService, 'refreshToken').mockReturnValue(refreshSubject.asObservable());

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      refreshSubject.next(undefined);
      refreshSubject.complete();

      const req = httpMock.expectOne('/server/api/core/communities');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${refreshedToken}`);
      req.flush({});

      await promise;
    });

    /**
     * Verifica que el reintento tras un refresh lleve el CSRF vigente y no el que
     * viajaba antes. DSpace rota el token XSRF en el refresh (login), así que el
     * `X-XSRF-TOKEN` previo daría 403 en una mutación reintentada.
     */
    it('should re-apply the fresh CSRF token to the retried request after a refresh', async () => {
      const { of } = await import('rxjs');
      const expiringSoon = Math.floor(Date.now() / 1000) + 200;
      vi.spyOn(authService, 'getToken').mockReturnValue(fakeJwt(expiringSoon));
      vi.spyOn(authService, 'refreshToken').mockReturnValue(of(undefined));
      xsrfExtractor.getToken.mockReturnValue('fresh-csrf');

      const promise = new Promise((resolve, reject) => {
        httpClient
          .post('/server/api/core/communities/abc', {}, { headers: { 'X-XSRF-TOKEN': 'stale-csrf' } })
          .subscribe({ next: resolve, error: reject });
      });

      const req = httpMock.expectOne('/server/api/core/communities/abc');
      expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('fresh-csrf');
      req.flush({});

      await promise;
    });
  });

  /** Redirección en 401 */

  describe('redirect on 401', () => {
    /** Verifica que un 401 con token vencido purgue el token y recargue a `?expired=true` con la ruta actual. */
    it('should remove the token and hard-redirect to ?expired with the current route on 401 when the token is expired', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue(EXPIRED_JWT);
      const removeSpy = vi.spyOn(authService, 'removeToken').mockImplementation(() => {});

      const promise = new Promise<void>((resolve) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: () => resolve(),
          error: () => resolve(),
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      await promise;
      expect(removeSpy).toHaveBeenCalled();
      expect(redirectFn).toHaveBeenCalledWith(
        `/iniciar-sesion?expired=true&returnUrl=${encodeURIComponent('/administrador/envios/abc')}`,
      );
    });

    /** Verifica que un 401 con token válido NO redirija (no atrapa páginas públicas). */
    it('should NOT redirect on 401 when the token is still valid', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue(VALID_JWT);

      const promise = new Promise<void>((resolve) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: () => resolve(),
          error: () => resolve(),
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      await promise;
      expect(redirectFn).not.toHaveBeenCalled();
    });

    /** Verifica que una respuesta exitosa no dispare redirect. */
    it('should NOT redirect on successful response', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue(VALID_JWT);

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush({});

      await promise;
      expect(redirectFn).not.toHaveBeenCalled();
    });
  });

  /**
   * Endpoints de `/authn/*` reciben el Bearer pero se saltan la rama de
   * refresh y el redirect. Esto evita la recursión del refresh sobre sí mismo
   * y el doble redirect cuando un refresh falla con 401. El AuthService dueño
   * de esas llamadas gestiona sus propios errores.
   */
  describe('endpoints under /authn/*', () => {
    function fakeJwt(expTimestamp: number): string {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ eid: 'user-001', exp: expTimestamp }));
      return `${header}.${payload}.fake-signature`;
    }

    /**
     * Verifica que un GET a /authn/status con token próximo a expirar
     * NO dispare la rama de refresh. Si lo hiciera, el refresh terminaría
     * llamando al mismo interceptor y entraría en loop.
     */
    it('should attach Bearer to /authn/* requests but NOT trigger refresh even when token is expiring soon', async () => {
      const expiringSoon = Math.floor(Date.now() / 1000) + 120;
      vi.spyOn(authService, 'getToken').mockReturnValue(fakeJwt(expiringSoon));
      const refreshSpy = vi.spyOn(authService, 'refreshToken');

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/authn/status').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/authn/status');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${fakeJwt(expiringSoon)}`);
      req.flush({ authenticated: true });

      await promise;
      expect(refreshSpy).not.toHaveBeenCalled();
    });

    /**
     * Verifica que un 401 en una response de /authn/* NO navegue a /login
     * desde el interceptor. El caller del AuthService (login, refreshToken,
     * restoreSession) maneja el error por su cuenta.
     */
    it('should NOT redirect to /login when /authn/* responds 401', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('valid-token');

      const promise = new Promise<void>((resolve) => {
        httpClient.post('/server/api/authn/login', null).subscribe({
          next: () => resolve(),
          error: () => resolve(),
        });
      });

      const req = httpMock.expectOne('/server/api/authn/login');
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      await promise;
      expect(redirectFn).not.toHaveBeenCalled();
    });
  });
});
