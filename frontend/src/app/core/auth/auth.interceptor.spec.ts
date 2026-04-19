import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { jwtInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

/**
 * Tests para jwtInterceptor.
 *
 * Interceptor HTTP que adjunta el header Authorization: Bearer
 * en todas las peticiones cuando hay un JWT almacenado en AuthService.
 * Sin token, las peticiones pasan sin modificar.
 *
 * Ciclo 2 TDD — Sprint 5
 */
describe('jwtInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: AuthService;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        AuthService,
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
  });
});
