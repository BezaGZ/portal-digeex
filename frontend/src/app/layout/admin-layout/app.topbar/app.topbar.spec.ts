/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AppTopbar } from './app.topbar';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthUser } from '../../../core/auth/models/auth-session.model';

/**
 * Tests de `AppTopbar`.
 *
 * Lee el usuario autenticado desde `AuthService.currentUser()` y delega el
 * cierre de sesion en `AuthService.logout()`, navegando al login al terminar
 * tanto en exito como en error (mismo patron que dspace-angular: limpiar
 * sesion local y mandar al login pase lo que pase con el backend).
 *
 * Ciclo 15 — Sprint 5.
 */
describe('AppTopbar', () => {
  let component: AppTopbar;
  let fixture: ComponentFixture<AppTopbar>;
  let logoutFn: ReturnType<typeof vi.fn>;
  let router: Router;

  function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
      uuid: 'eperson-001',
      email: 'juan.perez@mineduc.gob.gt',
      firstName: 'Juan',
      lastName: 'Pérez',
      ...overrides,
    };
  }

  function configure(currentUser: AuthUser | null): void {
    logoutFn = vi.fn().mockReturnValue(of(null));

    const authStub: Partial<AuthService> = {
      currentUser: signal<AuthUser | null>(currentUser),
      logout: logoutFn,
    };

    TestBed.configureTestingModule({
      imports: [AppTopbar],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    });

    fixture = TestBed.createComponent(AppTopbar);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  }

  /** Verifica que el topbar exponga userName y userEmail leyendo AuthService.currentUser(). */
  it('should render userName and userEmail from AuthService.currentUser()', () => {
    configure(buildAuthUser({ firstName: 'Ana', lastName: 'López', email: 'ana@mineduc.gob.gt' }));

    fixture.detectChanges();

    expect((component as any).userName()).toBe('Ana López');
    expect((component as any).userEmail()).toBe('ana@mineduc.gob.gt');
  });

  /**
   * Verifica que onLogout() llame a AuthService.logout() y navegue a /login.
   * Navega igual en exito y en error: si el backend falla igual limpiamos sesion y mandamos al login.
   */
  it('should call AuthService.logout() and navigate to /login on onLogout()', async () => {
    configure(buildAuthUser());
    fixture.detectChanges();

    component.onLogout();

    expect(logoutFn).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);

    logoutFn.mockReturnValue(throwError(() => new Error('boom')));
    (router.navigate as any).mockClear();
    component.onLogout();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
