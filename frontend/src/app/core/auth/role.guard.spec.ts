import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { MessageService } from 'primeng/api';
import { firstValueFrom, of, BehaviorSubject, Observable } from 'rxjs';
import { Mock, vi } from 'vitest';

import { roleGuard } from './role.guard';
import { AuthCallerService } from '../../features/administration/shared/services/auth-caller.service';

/**
 * Tests del `roleGuard` factory.
 *
 * Verifica que un `CanActivateFn` parametrizado por roles permitidos cumple
 * tres caminos: pasar cuando el rol del caller está en la lista, redirigir
 * a `/administrador` con toast OUT_OF_SCOPE cuando hay sesión pero el rol
 * no aplica, y redirigir cuando el caller no se puede resolver. La
 * verificación de sesión queda delegada al `authGuard` encadenado antes
 * (RN-32, RN-41, CA-12).
 *
 * Ciclo 41 TDD — Sprint 6.
 */
describe('roleGuard', () => {
  let mockAuthCaller: { currentCaller$: ReturnType<typeof of> };
  let mockRouter: { createUrlTree: Mock };
  let mockMessage: { add: Mock };
  const routeSnapshot = {} as ActivatedRouteSnapshot;
  const stateSnapshot = { url: '/administrador/subdirecciones' } as RouterStateSnapshot;

  function configureTestBed(caller: { role: string; sufijo: string | null } | null) {
    mockAuthCaller = { currentCaller$: of(caller) };
    mockRouter = { createUrlTree: vi.fn(() => ({ kind: 'urltree' } as unknown as UrlTree)) };
    mockMessage = { add: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthCallerService, useValue: mockAuthCaller },
        { provide: Router, useValue: mockRouter },
        { provide: MessageService, useValue: mockMessage },
      ],
    });
  }

  it('returns true when the caller role is in the allowed list', async () => {
    configureTestBed({ role: 'superadmin', sufijo: null });

    const guard = roleGuard(['superadmin', 'admin_subdireccion']);
    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeSnapshot, stateSnapshot) as Observable<boolean | UrlTree>),
    );

    expect(result).toBe(true);
    expect(mockRouter.createUrlTree).not.toHaveBeenCalled();
    expect(mockMessage.add).not.toHaveBeenCalled();
  });

  it('redirects to /administrador with OUT_OF_SCOPE toast when role is not allowed', async () => {
    configureTestBed({ role: 'personal_delegado', sufijo: 'ED_BASICA' });

    const guard = roleGuard(['superadmin']);
    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeSnapshot, stateSnapshot) as Observable<boolean | UrlTree>),
    );

    expect(result).toEqual({ kind: 'urltree' });
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/administrador']);
    expect(mockMessage.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: 'OUT_OF_SCOPE' }),
    );
  });

  it('waits for the first non-null caller emission before evaluating the role', async () => {
    const callerSubject = new BehaviorSubject<{ role: string; sufijo: string | null } | null>(null);
    mockAuthCaller = { currentCaller$: callerSubject.asObservable() };
    mockRouter = { createUrlTree: vi.fn(() => ({ kind: 'urltree' } as unknown as UrlTree)) };
    mockMessage = { add: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthCallerService, useValue: mockAuthCaller },
        { provide: Router, useValue: mockRouter },
        { provide: MessageService, useValue: mockMessage },
      ],
    });

    const guard = roleGuard(['superadmin']);
    const result$ = TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeSnapshot, stateSnapshot) as Observable<boolean | UrlTree>),
    );
    callerSubject.next({ role: 'superadmin', sufijo: null });

    expect(await result$).toBe(true);
    expect(mockMessage.add).not.toHaveBeenCalled();
  });
});
