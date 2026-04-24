import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import Cookies from 'js-cookie';

/**
 * Tests para authGuard.
 *
 * Guard funcional que protege rutas de administración.
 * Verifica isAuthenticated(): si es true permite la navegación,
 * si es false redirige a /login.
 *
 * Ciclo 3 TDD — Sprint 5. Ajustado en Ciclo 14.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
describe('authGuard', () => {
  let authService: AuthService;
  let httpMock: HttpTestingController;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: {} as any },
          { path: 'administrador', canActivate: [authGuard], component: {} as any },
        ]),
        AuthService,
      ],
    });

    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    Cookies.remove('dsAuthInfo');
  });

  /** Autenticado */

  describe('usuario autenticado', () => {
    /** Verifica que permita la navegación cuando el usuario está autenticado. */
    it('should allow navigation when authenticated', () => {
      authService.isAuthenticated.set(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, {} as any)
      );

      expect(result).toBe(true);
    });
  });

  /** No autenticado */

  describe('usuario no autenticado', () => {
    /** Verifica que redirija a /login cuando no hay sesión activa. */
    it('should redirect to /login when not authenticated', () => {
      authService.isAuthenticated.set(false);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, {} as any)
      );

      expect(result).not.toBe(true);
      expect(result.toString()).toContain('/login');
    });

    /** Verifica que preserve la URL destino en el queryParam returnUrl
     *  para que el login sepa a dónde devolver al usuario tras autenticar. */
    it('should preserve the attempted URL in the returnUrl queryParam', () => {
      authService.isAuthenticated.set(false);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/administrador/usuarios' } as any)
      );

      expect(result.toString()).toBe('/login?returnUrl=%2Fadministrador%2Fusuarios');
    });
  });

  /** Sesión restaurada desde cookie */

  describe('sesión restaurada desde cookie', () => {
    /** Verifica que tras un restoreSession exitoso (caso reload), el guard
     *  permita el paso. El initializer en producción espera a restoreSession
     *  antes de bootstrap, por lo que el guard ya encuentra isAuthenticated=true. */
    it('should resolve true after restoreSession completes with isAuthenticated=true', async () => {
      const tokenInfo = {
        accessToken: 'persisted-jwt',
        expires: Date.now() + 24 * 60 * 60 * 1000,
      };
      Cookies.set('dsAuthInfo', JSON.stringify(tokenInfo));

      const restorePromise = new Promise<void>((resolve, reject) => {
        authService.restoreSession().subscribe({ next: () => resolve(), error: reject });
      });

      httpMock.expectOne('/server/api/authn/status').flush({
        okay: true,
        authenticated: true,
        _links: {
          eperson: {
            href: 'http://localhost:8080/server/api/eperson/epersons/eperson-001',
          },
        },
      });
      httpMock.expectOne('/server/api/eperson/epersons/eperson-001').flush({
        uuid: 'eperson-001',
        name: 'Juan Pérez',
        handle: null,
        metadata: {
          'eperson.firstname': [{ value: 'Juan', language: null, authority: null, confidence: -1, place: 0 }],
          'eperson.lastname': [{ value: 'Pérez', language: null, authority: null, confidence: -1, place: 0 }],
        },
        netid: null,
        lastActive: '2026-04-18',
        canLogIn: true,
        email: 'juan@mineduc.gob.gt',
        requireCertificate: false,
        selfRegistered: false,
        type: 'eperson',
      });

      await restorePromise;

      expect(authService.isAuthenticated()).toBe(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as any, {} as any)
      );

      expect(result).toBe(true);
    });
  });
});
