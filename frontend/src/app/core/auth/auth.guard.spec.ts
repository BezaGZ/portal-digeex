import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

/**
 * Tests para authGuard.
 *
 * Guard funcional que protege rutas de administración.
 * Verifica isAuthenticated(): si es true permite la navegación,
 * si es false redirige a /login.
 *
 * Ciclo 3 TDD — Sprint 5
 */
describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;

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
    router = TestBed.inject(Router);
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
  });
});
