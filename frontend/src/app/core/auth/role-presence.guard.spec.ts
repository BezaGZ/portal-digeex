import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, of, Observable } from 'rxjs';
import { Mock, vi } from 'vitest';

import { rolePresenceGuard } from './role-presence.guard';
import { AuthorizationApiService } from '../api/authorization-api.service';
import { AuthService } from './auth.service';
import { HardRedirectService } from '../navigation/hard-redirect.service';

/**
 * Tests del `rolePresenceGuard`.
 *
 * Reja de entrada a `/administrador`: pregunta al backend nativo (`isAuthorized`
 * sobre el Site) si el usuario tiene alguna capacidad del portal
 * (`administratorOf`, `isCommunityAdmin`, `isCollectionAdmin`, `canSubmit`). Si
 * no tiene ninguna es un huérfano (cuenta sin grupo de rol, p. ej. su
 * subdirección fue borrada): cierra sesión y rebota a `/iniciar-sesion?error=sin-rol`.
 * Verificado contra el backend que esas cuatro features dan SI por rol y `no`
 * para el huérfano (y que `canViewUsageStatistics` no sirve: la tiene cualquiera).
 * Reemplaza la resolución racy del login (firstValueFrom sobre el stream cacheado).
 */
describe('rolePresenceGuard', () => {
  let mockAuthz: { isAuthorized: Mock };
  let mockAuth: { logout: Mock };
  let mockRedirect: { redirect: Mock };

  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function configureTestBed(hasFeature: (feature: string) => boolean) {
    mockAuthz = { isAuthorized: vi.fn((feature: string) => of(hasFeature(feature))) };
    mockAuth = { logout: vi.fn(() => of(null)) };
    mockRedirect = { redirect: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthorizationApiService, useValue: mockAuthz },
        { provide: AuthService, useValue: mockAuth },
        { provide: HardRedirectService, useValue: mockRedirect },
      ],
    });
  }

  function runGuard(): Promise<boolean | UrlTree> {
    const guard = rolePresenceGuard();
    return TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(route, state) as Observable<boolean | UrlTree>),
    );
  }

  it('allows when the user has at least one portal role feature', async () => {
    configureTestBed((feature) => feature === 'canSubmit');

    const result = await runGuard();

    expect(result).toBe(true);
    expect(mockAuth.logout).not.toHaveBeenCalled();
    expect(mockRedirect.redirect).not.toHaveBeenCalled();
  });

  it('allows superadmin (only administratorOf)', async () => {
    configureTestBed((feature) => feature === 'administratorOf');

    const result = await runGuard();

    expect(result).toBe(true);
  });

  it('logs out and hard-redirects to login with sin-rol when the user has no role features', async () => {
    configureTestBed(() => false);

    const result = await runGuard();

    expect(result).toBe(false);
    expect(mockAuth.logout).toHaveBeenCalled();
    expect(mockRedirect.redirect).toHaveBeenCalledWith('/iniciar-sesion?error=sin-rol');
  });

  it('checks the four role features over the Site (no object uri)', async () => {
    configureTestBed(() => true);

    await runGuard();

    const featuresChecked = mockAuthz.isAuthorized.mock.calls.map((c) => c[0]);
    expect(featuresChecked).toEqual(
      expect.arrayContaining(['administratorOf', 'isCommunityAdmin', 'isCollectionAdmin', 'canSubmit']),
    );
    // Sin uri: isAuthorized asume el Site.
    expect(mockAuthz.isAuthorized.mock.calls.every((c) => c[1] === undefined)).toBe(true);
  });
});
