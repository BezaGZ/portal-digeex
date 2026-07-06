/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { UrlTree, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import Cookies from 'js-cookie';

import { AuthService } from './auth.service';
import { redirectIfAuthenticatedGuard } from './redirect-if-authenticated.guard';

/**
 * Tests de `redirectIfAuthenticatedGuard`.
 *
 * Guard de la ruta del login: con sesión activa y JWT vigente redirige al
 * panel (o al `returnUrl` interno) en vez de mostrar el formulario; sin
 * sesión o con token vencido deja pasar. Evita que un login con credenciales
 * de otra cuenta viaje con el Bearer de la sesión actual (DSpace lo trata
 * como refresh y conserva la sesión vieja).
 *
 * Ciclo 65 TDD — Sprint 10.
 */
describe('redirectIfAuthenticatedGuard', () => {
  let authService: AuthService;

  /** JWT sintético con el claim `exp` indicado (epoch en segundos). */
  function buildJwt(exp: number): string {
    return `h.${btoa(JSON.stringify({ exp }))}.s`;
  }

  /** Deja la cookie `dsAuthInfo` con el token dado, como lo haría storeToken. */
  function seedCookie(token: string): void {
    Cookies.set('dsAuthInfo', JSON.stringify({ accessToken: token, expires: Date.now() + 60_000 }), {
      path: '/',
    });
  }

  /** Ejecuta el guard en contexto de inyección con el returnUrl opcional. */
  function runGuard(returnUrl: string | null = null): boolean | UrlTree {
    const route = { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } as any;
    return TestBed.runInInjectionContext(() =>
      redirectIfAuthenticatedGuard(route, {} as any),
    ) as boolean | UrlTree;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), AuthService],
    });
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    Cookies.remove('dsAuthInfo', { path: '/' });
  });

  /** Verifica que con sesión activa y token vigente redirija al panel. */
  it('should redirect to the panel when a valid session exists', () => {
    authService.isAuthenticated.set(true);
    seedCookie(buildJwt(Math.floor(Date.now() / 1000) + 600));

    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/administrador');
  });

  /** Verifica que un returnUrl interno gane como destino del redirect. */
  it('should redirect to an internal returnUrl when present', () => {
    authService.isAuthenticated.set(true);
    seedCookie(buildJwt(Math.floor(Date.now() / 1000) + 600));

    const result = runGuard('/administrador/envios');

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/administrador/envios');
  });

  /** Verifica que sin sesión deje pasar al formulario. */
  it('should allow the login page when there is no session', () => {
    authService.isAuthenticated.set(false);

    expect(runGuard()).toBe(true);
  });

  /**
   * Verifica que un token vencido en la cookie deje pasar al formulario.
   * Esa sesión ya no sirve en el backend; redirigirla al panel solo rebotaría.
   */
  it('should allow the login page when the stored token already expired', () => {
    authService.isAuthenticated.set(true);
    seedCookie(buildJwt(Math.floor(Date.now() / 1000) - 600));

    expect(runGuard()).toBe(true);
  });
});
