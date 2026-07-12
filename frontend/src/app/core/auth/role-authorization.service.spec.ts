import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { Mock, vi } from 'vitest';

import { RoleAuthorizationService } from './role-authorization.service';
import { AuthorizationApiService } from '../api/authorization-api.service';
import { FeatureId } from '../api/models/feature-id';

/**
 * Tests de `RoleAuthorizationService`.
 *
 * Resolución del rol del portal por features de Site contra el endpoint nativo
 * (`/api/authz/authorizations/search/object` vía `AuthorizationApiService`),
 * en vez de deducirlo del nombre de los grupos. El servicio es frío a propósito:
 * los guards necesitan la respuesta actual del backend, no una cacheada; la
 * caché de identidad vive en el Caller.
 *
 * Ciclo 2 TDD — Sprint 11.
 */
describe('RoleAuthorizationService', () => {
  let service: RoleAuthorizationService;
  let mockAuthz: { isAuthorized: Mock };

  function configureTestBed(hasFeature: (feature: FeatureId) => boolean) {
    mockAuthz = { isAuthorized: vi.fn((feature: FeatureId) => of(hasFeature(feature))) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthorizationApiService, useValue: mockAuthz }],
    });
    service = TestBed.inject(RoleAuthorizationService);
  }

  /** Verifica que una resolución consulte exactamente las cuatro features de rol, una vez cada una. */
  it('should query exactly the four role features over the Site once each', async () => {
    configureTestBed(() => false);

    await firstValueFrom(service.resolveRole$());

    expect(mockAuthz.isAuthorized).toHaveBeenCalledTimes(4);
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('administratorOf');
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('isCommunityAdmin');
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('isCollectionAdmin');
    expect(mockAuthz.isAuthorized).toHaveBeenCalledWith('canSubmit');
  });

  /** Verifica el mapeo end-to-end con la combinación real del admin_sub. */
  it('should resolve admin_subdireccion when the backend grants all but administratorOf', async () => {
    configureTestBed((feature) => feature !== 'administratorOf');

    const role = await firstValueFrom(service.resolveRole$());

    expect(role).toBe('admin_subdireccion');
  });

  /**
   * Verifica que cada resolución consulte fresco, sin caché interna.
   * Un caché acá reintroduciría el race del huérfano que motivó el guard fresco.
   */
  it('should query the backend fresh on every subscription (no internal cache)', async () => {
    configureTestBed(() => false);

    await firstValueFrom(service.resolveRole$());
    await firstValueFrom(service.resolveRole$());

    expect(mockAuthz.isAuthorized).toHaveBeenCalledTimes(8);
  });
});
