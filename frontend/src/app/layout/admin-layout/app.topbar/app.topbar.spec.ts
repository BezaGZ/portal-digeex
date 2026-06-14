/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AppTopbar } from './app.topbar';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthUser } from '../../../core/auth/models/auth-session.model';
import { HardRedirectService } from '../../../core/navigation/hard-redirect.service';

/**
 * Tests de `AppTopbar`.
 *
 * Lee el usuario autenticado desde `AuthService.currentUser()` y delega el
 * cierre de sesion en `AuthService.logout()`. Al terminar (exito o error) hace
 * una recarga dura al login via `HardRedirectService`: reinicia la app para
 * resincronizar el token CSRF, igual que dspace (refreshAfterLogout).
 *
 * Ciclo 15 — Sprint 5. Recarga dura en Ciclo 43 — Sprint 8.
 */
describe('AppTopbar', () => {
  let component: AppTopbar;
  let fixture: ComponentFixture<AppTopbar>;
  let logoutFn: ReturnType<typeof vi.fn>;
  let redirectFn: ReturnType<typeof vi.fn>;

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
    redirectFn = vi.fn();

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
        { provide: HardRedirectService, useValue: { redirect: redirectFn } },
      ],
    });

    fixture = TestBed.createComponent(AppTopbar);
    component = fixture.componentInstance;
  }

  /** Verifica que el topbar exponga userName y userEmail leyendo AuthService.currentUser(). */
  it('should render userName and userEmail from AuthService.currentUser()', () => {
    configure(buildAuthUser({ firstName: 'Ana', lastName: 'López', email: 'ana@mineduc.gob.gt' }));

    fixture.detectChanges();

    expect((component as any).userName()).toBe('Ana López');
    expect((component as any).userEmail()).toBe('ana@mineduc.gob.gt');
  });

  /**
   * Verifica que onLogout() llame a AuthService.logout() y haga la recarga dura
   * al login. Misma recarga en exito y en error: si el backend falla igual se
   * reinicia la app y se manda al login.
   */
  it('should call AuthService.logout() and hard-redirect to login on onLogout()', () => {
    configure(buildAuthUser());
    fixture.detectChanges();

    component.onLogout();

    expect(logoutFn).toHaveBeenCalled();
    expect(redirectFn).toHaveBeenCalledWith('/iniciar-sesion');

    logoutFn.mockReturnValue(throwError(() => new Error('boom')));
    redirectFn.mockClear();
    component.onLogout();
    expect(redirectFn).toHaveBeenCalledWith('/iniciar-sesion');
  });
});
