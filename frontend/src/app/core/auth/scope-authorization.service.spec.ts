import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { Mock, vi } from 'vitest';

import { ScopeAuthorizationService } from './scope-authorization.service';
import { CommunityApiService } from '../api/community-api.service';
import { CollectionApiService } from '../api/collection-api.service';

/**
 * Tests de `ScopeAuthorizationService`.
 *
 * Resolución del uuid de la subdirección del caller con los searches
 * autorizados del backend (`findAdminAuthorized` para admin_sub;
 * `findSubmitAuthorized` → `parentCommunity` para el delegado), sin depender
 * de nombres de grupo ni del metadato de sufijo. Superadmin y rol nulo
 * resuelven null sin HTTP; listas vacías resuelven null (fail-closed).
 *
 * Ciclo 3 TDD — Sprint 11.
 */
describe('ScopeAuthorizationService', () => {
  let service: ScopeAuthorizationService;
  let mockCommunityApi: { searchAdminAuthorized: Mock };
  let mockCollectionApi: { searchSubmitAuthorized: Mock; getParentCommunity: Mock };

  function configureTestBed(options: {
    adminCommunities?: unknown[];
    submitCollections?: unknown[];
    parentCommunity?: unknown;
  } = {}) {
    mockCommunityApi = {
      searchAdminAuthorized: vi.fn(() =>
        of({
          _embedded: { communities: options.adminCommunities ?? [] },
          _links: {},
          page: { size: 20, totalElements: options.adminCommunities?.length ?? 0, totalPages: 1, number: 0 },
        }),
      ),
    };
    mockCollectionApi = {
      searchSubmitAuthorized: vi.fn(() =>
        of({
          _embedded: { collections: options.submitCollections ?? [] },
          _links: {},
          page: { size: 20, totalElements: options.submitCollections?.length ?? 0, totalPages: 1, number: 0 },
        }),
      ),
      getParentCommunity: vi.fn(() => of(options.parentCommunity ?? null)),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CommunityApiService, useValue: mockCommunityApi },
        { provide: CollectionApiService, useValue: mockCollectionApi },
      ],
    });
    service = TestBed.inject(ScopeAuthorizationService);
  }

  /** Verifica que el superadmin resuelva null sin HTTP: opera global y elige sub libremente. */
  it('should resolve null for superadmin without hitting the backend', async () => {
    configureTestBed();

    const scope = await firstValueFrom(service.resolveScopeUuid$('superadmin'));

    expect(scope).toBeNull();
    expect(mockCommunityApi.searchAdminAuthorized).not.toHaveBeenCalled();
    expect(mockCollectionApi.searchSubmitAuthorized).not.toHaveBeenCalled();
  });

  /** Verifica que admin_sub tome la primera comunidad de findAdminAuthorized como scope. */
  it('should resolve the first admin-authorized community uuid for admin_subdireccion', async () => {
    configureTestBed({
      adminCommunities: [
        { uuid: 'd7f5685c-3e9d-49b0-a109-ddbd100368ee', name: 'Subdirección de Educación Básica' },
      ],
    });

    const scope = await firstValueFrom(service.resolveScopeUuid$('admin_subdireccion'));

    expect(scope).toBe('d7f5685c-3e9d-49b0-a109-ddbd100368ee');
    expect(mockCollectionApi.searchSubmitAuthorized).not.toHaveBeenCalled();
  });

  /**
   * Verifica el doble salto del delegado: primera colección autorizada → comunidad padre.
   * El delegado no administra comunidades, así que su sub se deduce de sus programas.
   */
  it('should resolve the parent community of the first submit-authorized collection for personal_delegado', async () => {
    configureTestBed({
      submitCollections: [
        { uuid: 'b21a5904-8f7c-4bcc-bcba-ab4a6df69304', name: 'Investigaciones Educativas' },
      ],
      parentCommunity: {
        uuid: '08b572b5-5c47-4005-ad3a-a0f563ce639f',
        name: 'Subdirección de Formación, Investigación y Proyectos Educativos',
      },
    });

    const scope = await firstValueFrom(service.resolveScopeUuid$('personal_delegado'));

    expect(scope).toBe('08b572b5-5c47-4005-ad3a-a0f563ce639f');
    expect(mockCollectionApi.getParentCommunity).toHaveBeenCalledWith(
      'b21a5904-8f7c-4bcc-bcba-ab4a6df69304',
    );
    expect(mockCommunityApi.searchAdminAuthorized).not.toHaveBeenCalled();
  });

  /** Verifica el fail-closed: sin objetos autorizados no hay scope, nunca "ver todo". */
  it('should resolve null when the backend returns no authorized objects for the role', async () => {
    configureTestBed();

    expect(await firstValueFrom(service.resolveScopeUuid$('admin_subdireccion'))).toBeNull();
    expect(await firstValueFrom(service.resolveScopeUuid$('personal_delegado'))).toBeNull();
  });

  /** Verifica que un rol nulo (huérfano) resuelva null sin gastar HTTP. */
  it('should resolve null for a null role without hitting the backend', async () => {
    configureTestBed();

    const scope = await firstValueFrom(service.resolveScopeUuid$(null));

    expect(scope).toBeNull();
    expect(mockCommunityApi.searchAdminAuthorized).not.toHaveBeenCalled();
    expect(mockCollectionApi.searchSubmitAuthorized).not.toHaveBeenCalled();
  });
});
