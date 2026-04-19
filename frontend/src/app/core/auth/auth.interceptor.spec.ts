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

  describe('con token', () => {
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

  describe('sin token', () => {
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

  /** Refresh automático */

  describe('refresh automático', () => {
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

  describe('redirección en 401', () => {
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
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
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
});
