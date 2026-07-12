import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { MessageService } from 'primeng/api';
import { firstValueFrom, of, BehaviorSubject, Observable } from 'rxjs';
import { Mock, vi } from 'vitest';

import { roleGuard } from './role.guard';
import { CallerProvider } from './caller-provider';
import { Caller } from './caller.model';

/**
 * Tests del `roleGuard` factory.
 *
 * Verifica que un `CanActivateFn` parametrizado por roles permitidos cumple
 * tres caminos: pasar cuando el rol del caller está en la lista, redirigir
 * a `/administrador` con toast de acceso restringido cuando hay sesión pero el rol
 * no aplica, y redirigir cuando el caller no se puede resolver. La
 * verificación de sesión queda delegada al `authGuard` encadenado antes
 * (RN-32, RN-41, CA-12).
 *
 * Ciclo 41 TDD — Sprint 6. Ajustado en Ciclo 27 (Sprint 10).
 */
describe('roleGuard', () => {
  let mockCallerProvider: { currentCaller$: Observable<Caller | null> };
  let mockRouter: { createUrlTree: Mock };
  let mockMessage: { add: Mock };
  const routeSnapshot = {} as ActivatedRouteSnapshot;
  const stateSnapshot = { url: '/administrador/subdirecciones' } as RouterStateSnapshot;

  function configureTestBed(caller: Caller | null) {
    mockCallerProvider = { currentCaller$: of(caller) };
    mockRouter = { createUrlTree: vi.fn(() => ({ kind: 'urltree' } as unknown as UrlTree)) };
    mockMessage = { add: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CallerProvider, useValue: mockCallerProvider },
        { provide: Router, useValue: mockRouter },
        { provide: MessageService, useValue: mockMessage },
      ],
    });
  }

  /** Verifica que deje pasar cuando el rol del caller está en la lista permitida. */
  it('returns true when the caller role is in the allowed list', async () => {
    configureTestBed({ role: 'superadmin', scopeUuid: null });

    const guard = roleGuard(['superadmin', 'admin_subdireccion']);
    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeSnapshot, stateSnapshot) as Observable<boolean | UrlTree>),
    );

    expect(result).toBe(true);
    expect(mockRouter.createUrlTree).not.toHaveBeenCalled();
    expect(mockMessage.add).not.toHaveBeenCalled();
  });

  /** Verifica que redirija a /administrador con toast de acceso restringido cuando el rol no aplica. */
  it('redirects to /administrador with an access-restricted toast when role is not allowed', async () => {
    configureTestBed({ role: 'personal_delegado', scopeUuid: 'ED_BASICA' });

    const guard = roleGuard(['superadmin']);
    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeSnapshot, stateSnapshot) as Observable<boolean | UrlTree>),
    );

    expect(result).toEqual({ kind: 'urltree' });
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/administrador']);
    expect(mockMessage.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: 'Acceso restringido' }),
    );
  });

  /** Verifica que espere la primera emisión de caller no-null antes de evaluar el rol. */
  it('waits for the first non-null caller emission before evaluating the role', async () => {
    const callerSubject = new BehaviorSubject<Caller | null>(null);
    mockCallerProvider = { currentCaller$: callerSubject.asObservable() };
    mockRouter = { createUrlTree: vi.fn(() => ({ kind: 'urltree' } as unknown as UrlTree)) };
    mockMessage = { add: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CallerProvider, useValue: mockCallerProvider },
        { provide: Router, useValue: mockRouter },
        { provide: MessageService, useValue: mockMessage },
      ],
    });

    const guard = roleGuard(['superadmin']);
    const result$ = TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeSnapshot, stateSnapshot) as Observable<boolean | UrlTree>),
    );
    callerSubject.next({ role: 'superadmin', scopeUuid: null });

    expect(await result$).toBe(true);
    expect(mockMessage.add).not.toHaveBeenCalled();
  });
});
