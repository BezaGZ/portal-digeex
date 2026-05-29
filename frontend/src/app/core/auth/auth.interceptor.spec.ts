import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { jwtInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

/**
 * Tests para jwtInterceptor.
 *
 * Interceptor HTTP que adjunta el header Authorization: Bearer,
 * gestiona refresh automático del JWT cuando está próximo a expirar,
 * y redirige al login cuando DSpace responde 401.
 *
 * Ciclo 2 TDD — Sprint 5
 */
describe('jwtInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: AuthService;
  let router: Router;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
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
     * rechaza con 401 cuando el token está stale o expirado, lo que cascada
     * en un `router.navigate(['/iniciar-sesion'])` por `redirectOn401`.
     * Excluir el path del Bearer mantiene la pantalla de reset utilizable
     * desde una pestaña con sesión obsoleta.
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
     * Verifica que 3 peticiones concurrentes disparen solo 1 refresh.
     * El mock usa Subject (asíncrono) para simular el comportamiento
     * real del HTTP POST a DSpace que no completa inmediatamente.
     */
    it('should only call refreshToken once for multiple concurrent requests', async () => {
      const { Subject } = await import('rxjs');
      const expiringSoon = Math.floor(Date.now() / 1000) + 200;
      vi.spyOn(authService, 'getToken').mockReturnValue(fakeJwt(expiringSoon));

      const refreshSubject = new Subject<void>();
      vi.spyOn(authService, 'refreshToken').mockReturnValue(refreshSubject.asObservable());

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

      refreshSubject.next(undefined);
      refreshSubject.complete();

      const reqs = [
        httpMock.expectOne('/server/api/core/communities'),
        httpMock.expectOne('/server/api/core/collections'),
        httpMock.expectOne('/server/api/core/items'),
      ];
      reqs.forEach((r) => r.flush({}));

      await Promise.all(promises);
      expect(authService.refreshToken).toHaveBeenCalledTimes(1);
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
  });

  /** Redirección en 401 */

  describe('redirect on 401', () => {
    /** Verifica que redirige a /login cuando DSpace responde 401. */
    it('should redirect to /login on 401 response', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('valid-token');
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const promise = new Promise<void>((resolve) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: () => resolve(),
          error: () => resolve(),
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      await promise;
      expect(router.navigate).toHaveBeenCalledWith(['/iniciar-sesion']);
    });

    /** Verifica que NO redirige cuando la respuesta es exitosa (200). */
    it('should NOT redirect on successful response', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('valid-token');
      vi.spyOn(router, 'navigate');

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush({});

      await promise;
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  /**
   * DSpace 9.2 rota el JWT en cada response autenticada; el interceptor lee
   * el header Authorization del HttpResponse y lo persiste vía
   * storeRotatedToken. Esto evita relogin innecesario en sesiones largas.
   */
  describe('rotated JWT capture', () => {
    /** Verifica que un Authorization en el response persista el token rotado. */
    it('should call storeRotatedToken with the new token when response brings an Authorization header', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('current-token');
      const storeRotatedSpy = vi.spyOn(authService, 'storeRotatedToken');

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush({}, { headers: { Authorization: 'Bearer rotated-token-xyz' } });

      await promise;
      expect(storeRotatedSpy).toHaveBeenCalledWith('rotated-token-xyz');
    });

    /** Verifica que sin Authorization en el response no se toque el token. */
    it('should NOT call storeRotatedToken when response has no Authorization header', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('current-token');
      const storeRotatedSpy = vi.spyOn(authService, 'storeRotatedToken');

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush({});

      await promise;
      expect(storeRotatedSpy).not.toHaveBeenCalled();
    });

    /** Verifica que un Authorization mal formado (sin prefijo Bearer) se ignora. */
    it('should NOT call storeRotatedToken when the Authorization header is malformed', async () => {
      vi.spyOn(authService, 'getToken').mockReturnValue('current-token');
      const storeRotatedSpy = vi.spyOn(authService, 'storeRotatedToken');

      const promise = new Promise((resolve, reject) => {
        httpClient.get('/server/api/core/communities').subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities');
      req.flush({}, { headers: { Authorization: 'NotBearer garbage' } });

      await promise;
      expect(storeRotatedSpy).not.toHaveBeenCalled();
    });
  });

  /**
   * Endpoints de `/authn/*` reciben el Bearer pero se saltan la rama de
   * refresh y el `redirectOn401`. Esto evita la recursión del refresh sobre
   * sí mismo y el doble navigate cuando un refresh falla con 401. El
   * AuthService dueño de esas llamadas gestiona sus propios errores.
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
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const promise = new Promise<void>((resolve) => {
        httpClient.post('/server/api/authn/login', null).subscribe({
          next: () => resolve(),
          error: () => resolve(),
        });
      });

      const req = httpMock.expectOne('/server/api/authn/login');
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      await promise;
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });
});
