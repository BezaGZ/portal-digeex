import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { Mock, vi } from 'vitest';

import { RoleAuthorizationService } from './role-authorization.service';
import { AuthorizationApiService } from '../api/authorization-api.service';
import { AuthService } from './auth.service';
import { FeatureId } from '../api/models/feature-id';
import { EPerson } from '../api/models/eperson.model';

/**
 * Tests de `RoleAuthorizationService`.
 *
 * Resolución del rol del portal por las cuatro features de Site contra el
 * endpoint nativo (`/api/authz/authorizations/search/object` vía
 * `AuthorizationApiService`), en vez de deducirlo del nombre de los grupos.
 * La resolución se cachea por el uuid del EPerson autenticado, de modo que
 * el guard y la identidad del Caller comparten una sola consulta por sesión;
 * un cambio de usuario (login de otra cuenta) invalida el cache y re-resuelve.
 *
 * Ciclo 2 TDD — Sprint 11. Ajustado en Ciclo 11 (cache por eperson para
 * unificar la resolución de guard e identidad).
 */
describe('RoleAuthorizationService', () => {
  let service: RoleAuthorizationService;
  let mockAuthz: { isAuthorized: Mock };
  let epersonSignal: WritableSignal<EPerson | null>;

  const eperson = (uuid: string): EPerson => ({ uuid } as EPerson);

  function configureTestBed(hasFeature: (feature: FeatureId) => boolean, current: EPerson | null) {
    mockAuthz = { isAuthorized: vi.fn((feature: FeatureId) => of(hasFeature(feature))) };
    epersonSignal = signal<EPerson | null>(current);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthorizationApiService, useValue: mockAuthz },
        { provide: AuthService, useValue: { currentEPerson: epersonSignal } },
      ],
    });
    service = TestBed.inject(RoleAuthorizationService);
  }

  /** Verifica que una resolución consulte exactamente las cuatro features de rol, una vez cada una. */
  it('should query exactly the four role features over the Site', async () => {
    configureTestBed(() => false, eperson('ep-1'));

    await firstValueFrom(service.resolveRole$());

    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('administratorOf');
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('isCommunityAdmin');
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('isCollectionAdmin');
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('canSubmit');
  });

  /** Verifica el mapeo end-to-end con la combinación real del admin_sub. */
  it('should resolve admin_subdireccion when the backend grants all but administratorOf', async () => {
    configureTestBed((feature) => feature !== 'administratorOf', eperson('ep-1'));

    const role = await firstValueFrom(service.resolveRole$());

    expect(role).toBe('admin_subdireccion');
  });

  /**
   * Verifica que la resolución se cachee por eperson: dos suscripciones del
   * mismo usuario comparten una sola consulta (guard e identidad no duplican).
   */
  it('should resolve once and share the result across subscriptions of the same eperson', async () => {
    configureTestBed(() => false, eperson('ep-1'));

    await firstValueFrom(service.resolveRole$());
    await firstValueFrom(service.resolveRole$());

    expect(mockAuthz.isAuthorized).toHaveBeenCalledTimes(4);
  });

  /** Verifica que un cambio de usuario invalide el cache y dispare una resolución fresca. */
  it('should re-resolve when the authenticated eperson changes', async () => {
    configureTestBed(() => false, eperson('ep-1'));

    await firstValueFrom(service.resolveRole$());
    epersonSignal.set(eperson('ep-2'));
    await firstValueFrom(service.resolveRole$());

    expect(mockAuthz.isAuthorized).toHaveBeenCalledTimes(8);
  });

  /** Verifica que sin sesión resuelva null sin tocar el backend (fail-closed). */
  it('should resolve null without querying when there is no eperson', async () => {
    configureTestBed(() => true, null);

    const role = await firstValueFrom(service.resolveRole$());

    expect(role).toBeNull();
    expect(mockAuthz.isAuthorized).not.toHaveBeenCalled();
  });
});
