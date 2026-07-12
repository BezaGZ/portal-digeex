import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthCallerService } from './auth-caller.service';
import { UserManagementService } from '../../users/services/user-management.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { RoleAuthorizationService } from '../../../../core/auth/role-authorization.service';
import { ScopeAuthorizationService } from '../../../../core/auth/scope-authorization.service';
import { UserRole } from '../../../../core/auth/user-role.model';

/**
 * Tests de AuthCallerService.
 *
 * La identidad del caller se afirma por el backend: rol por las features de
 * Site (`RoleAuthorizationService`) y scope por los searches autorizados
 * (`ScopeAuthorizationService`), nunca por nombres de grupo. Se resuelve una
 * vez por sesión y se comparte (`shareReplay`); sin sesión o sin ninguna
 * feature (huérfano) el caller es null. `currentActor$` sigue derivando de la
 * vista del usuario porque describe identidad (nombre, correo), no permisos.
 *
 * Ciclo 12 TDD — Sprint 6. Ajustado en Ciclos 3 y 6 (Sprint 11).
 */
describe('AuthCallerService', () => {
  let mockRoleAuthz: { resolveRole$: ReturnType<typeof vi.fn> };
  let mockScopeAuthz: { resolveScopeUuid$: ReturnType<typeof vi.fn> };

  function setup(options: {
    eperson?: { uuid: string } | null;
    role?: UserRole | null;
    scopeUuid?: string | null;
  }) {
    mockRoleAuthz = { resolveRole$: vi.fn(() => of(options.role ?? null)) };
    mockScopeAuthz = { resolveScopeUuid$: vi.fn(() => of(options.scopeUuid ?? null)) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthCallerService,
        { provide: AuthService, useValue: { currentEPerson: signal(options.eperson ?? null) } },
        { provide: UserManagementService, useValue: { currentUserView$: of(null) } },
        { provide: RoleAuthorizationService, useValue: mockRoleAuthz },
        { provide: ScopeAuthorizationService, useValue: mockScopeAuthz },
      ],
    });
    return TestBed.inject(AuthCallerService);
  }

  /** Verifica que el rol salga de las features del backend, no de nombres de grupo. */
  it('should resolve the Caller from backend features and authorized scope', async () => {
    const service = setup({
      eperson: { uuid: 'u1' },
      role: 'admin_subdireccion',
      scopeUuid: 'd7f5685c-3e9d-49b0-a109-ddbd100368ee',
    });

    const caller = await firstValueFrom(service.currentCaller$);

    expect(caller).toEqual({
      role: 'admin_subdireccion',
      scopeUuid: 'd7f5685c-3e9d-49b0-a109-ddbd100368ee',
    });
    expect(mockScopeAuthz.resolveScopeUuid$).toHaveBeenCalledWith('admin_subdireccion');
  });

  /** Verifica que el superadmin emita scope null (global, sin sub acotada). */
  it('should emit a superadmin Caller with null scope', async () => {
    const service = setup({ eperson: { uuid: 'u2' }, role: 'superadmin', scopeUuid: null });

    const caller = await firstValueFrom(service.currentCaller$);

    expect(caller).toEqual({ role: 'superadmin', scopeUuid: null });
  });

  /** Verifica que sin sesión el caller sea null sin consultar features. */
  it('should emit null without querying features when there is no session', async () => {
    const service = setup({ eperson: null });

    const caller = await firstValueFrom(service.currentCaller$);

    expect(caller).toBeNull();
    expect(mockRoleAuthz.resolveRole$).not.toHaveBeenCalled();
  });

  /** Verifica que el huérfano (ninguna feature) emita null sin resolver scope. */
  it('should emit null for an orphan account (no role features)', async () => {
    const service = setup({ eperson: { uuid: 'u3' }, role: null });

    const caller = await firstValueFrom(service.currentCaller$);

    expect(caller).toBeNull();
    expect(mockScopeAuthz.resolveScopeUuid$).not.toHaveBeenCalled();
  });

  /**
   * Verifica que la identidad se resuelva una vez y se comparta.
   * Sin shareReplay cada pantalla suscripta repetiría los GETs de rol y scope.
   */
  it('should share a single identity resolution across subscribers', async () => {
    const service = setup({
      eperson: { uuid: 'u1' },
      role: 'personal_delegado',
      scopeUuid: 'sub-uuid',
    });

    await firstValueFrom(service.currentCaller$);
    await firstValueFrom(service.currentCaller$);

    expect(mockRoleAuthz.resolveRole$).toHaveBeenCalledTimes(1);
    expect(mockScopeAuthz.resolveScopeUuid$).toHaveBeenCalledTimes(1);
  });
});
