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

import { featureGuard } from './feature.guard';
import { AuthorizationApiService } from '../api/authorization-api.service';
import { ITEMS_PATH, buildBackendApiUrl } from '../api/dspace-rest.util';

/**
 * Tests del `featureGuard` factory.
 *
 * Guard parametrizado por (feature, path del objeto): lee el uuid de la ruta,
 * arma el self absoluto del objeto y pregunta al backend nativo
 * (`AuthorizationApiService.isAuthorized`) si el usuario puede ejercer la
 * feature. Pasa en `true`, redirige a `/administrador` con toast de acceso restringido
 * en `false`. Cierra la entrada por URL directa a un recurso ajeno (sección 2.6).
 * Va encadenado tras `authGuard`, que ya garantiza sesión.
 *
 * Ciclo 2 TDD — Mejora 9. Ajustado en Ciclo 27 (Sprint 10).
 */
describe('featureGuard', () => {
  let mockAuthz: { isAuthorized: Mock };
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

  function configureTestBed(authorized: boolean) {
    mockAuthz = { isAuthorized: vi.fn(() => of(authorized)) };
    mockRouter = { createUrlTree: vi.fn(() => ({ kind: 'urltree' } as unknown as UrlTree)) };
    mockMessage = { add: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthorizationApiService, useValue: mockAuthz },
        { provide: Router, useValue: mockRouter },
        { provide: MessageService, useValue: mockMessage },
      ],
    });
  }

  /** Verifica que consulte la feature sobre el objeto armado desde el uuid de ruta y deje pasar si está autorizado. */
  it('asks the backend for the feature on the object built from the route uuid and allows when authorized', async () => {
    configureTestBed(true);

    const guard = featureGuard('canEditItem', ITEMS_PATH);
    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeWith('item-uuid'), stateSnapshot) as Observable<boolean | UrlTree>),
    );

    expect(result).toBe(true);
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith(
      'canEditItem',
      buildBackendApiUrl(`${ITEMS_PATH}/item-uuid`),
    );
    expect(mockRouter.createUrlTree).not.toHaveBeenCalled();
  });

  /** Verifica que redirija a /administrador con toast de acceso restringido cuando no está autorizado. */
  it('redirects to /administrador with an access-restricted toast when not authorized', async () => {
    configureTestBed(false);

    const guard = featureGuard('canEditItem', ITEMS_PATH);
    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(guard(routeWith('item-uuid'), stateSnapshot) as Observable<boolean | UrlTree>),
    );

    expect(result).toEqual({ kind: 'urltree' });
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/administrador']);
    expect(mockMessage.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: 'Acceso restringido' }),
    );
  });
});
