import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { MessageService } from 'primeng/api';
import { firstValueFrom, of, Observable } from 'rxjs';
import { Mock, vi } from 'vitest';

import { ownSubmissionGuard } from './own-submission.guard';
import { AuthService } from './auth.service';
import { CallerProvider } from './caller-provider';
import { ItemApiService } from '../api/item-api.service';
import { Caller } from './caller.model';

/**
 * Tests del `ownSubmissionGuard` factory.
 *
 * Reja de UI que confina al `personal_delegado` a editar solo lo que él subió:
 * compara el submitter del item (dato del backend) con el uuid del usuario
 * logueado. `superadmin` y `admin_subdireccion` pasan sin chequeo (editan lo de
 * su scope, RN-18). Cierra la entrada por URL directa a un item ajeno de la
 * misma sub. No es frontera de seguridad —el backend en Final 1 lo permite— sino
 * consistencia de UI. Va último, tras `roleGuard` + `featureGuard`.
 */
describe('ownSubmissionGuard', () => {
  let mockAuth: { currentUser: Mock };
  let mockCaller: { currentCaller$: Observable<Caller | null> };
  let mockItemApi: { getSubmitter: Mock };
  let mockRouter: { createUrlTree: Mock };
  let mockMessage: { add: Mock };
  const stateSnapshot = {
    url: '/administrador/envios/item-uuid/editar',
  } as RouterStateSnapshot;

  function routeWith(uuid: string | null): ActivatedRouteSnapshot {
    return {
      paramMap: convertToParamMap(uuid ? { uuid } : {}),
    } as ActivatedRouteSnapshot;
  }

  function configureTestBed(
    caller: Caller | null,
    currentUserUuid: string | null,
    submitterUuid: string | null = null,
  ) {
    mockAuth = {
      currentUser: vi.fn(() => (currentUserUuid ? { uuid: currentUserUuid } : null)),
    };
    mockCaller = { currentCaller$: of(caller) };
    mockItemApi = { getSubmitter: vi.fn(() => of(submitterUuid)) };
    mockRouter = { createUrlTree: vi.fn(() => ({ kind: 'urltree' } as unknown as UrlTree)) };
    mockMessage = { add: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: CallerProvider, useValue: mockCaller },
        { provide: ItemApiService, useValue: mockItemApi },
        { provide: Router, useValue: mockRouter },
        { provide: MessageService, useValue: mockMessage },
      ],
    });
  }

  function runGuard(): Promise<boolean | UrlTree> {
    const guard = ownSubmissionGuard();
    return TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeWith('item-uuid'), stateSnapshot) as Observable<boolean | UrlTree>),
    );
  }

  /** Verifica que el superadmin pase sin consultar el submitter del item. */
  it('lets superadmin through without checking the submitter', async () => {
    configureTestBed({ role: 'superadmin', sufijo: null }, 'me-uuid');

    const result = await runGuard();

    expect(result).toBe(true);
    expect(mockItemApi.getSubmitter).not.toHaveBeenCalled();
  });

  /** Verifica que el admin_subdireccion pase sin consultar el submitter del item. */
  it('lets admin_subdireccion through without checking the submitter', async () => {
    configureTestBed({ role: 'admin_subdireccion', sufijo: 'ED_BASICA' }, 'me-uuid');

    const result = await runGuard();

    expect(result).toBe(true);
    expect(mockItemApi.getSubmitter).not.toHaveBeenCalled();
  });

  /** Verifica que el personal_delegado pueda editar un item que él mismo subió. */
  it('lets personal_delegado edit an item they submitted', async () => {
    configureTestBed({ role: 'personal_delegado', sufijo: 'ED_BASICA' }, 'me-uuid', 'me-uuid');

    const result = await runGuard();

    expect(mockItemApi.getSubmitter).toHaveBeenCalledWith('item-uuid');
    expect(result).toBe(true);
  });

  /** Verifica que redirija al personal_delegado a /administrador/envios con toast cuando el item no es suyo. */
  it('redirects personal_delegado to /administrador/envios with toast when the item is not theirs', async () => {
    configureTestBed({ role: 'personal_delegado', sufijo: 'ED_BASICA' }, 'me-uuid', 'other-uuid');

    const result = await runGuard();

    expect(result).toEqual({ kind: 'urltree' });
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/administrador/envios']);
    expect(mockMessage.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: 'Acceso restringido' }),
    );
  });
});
