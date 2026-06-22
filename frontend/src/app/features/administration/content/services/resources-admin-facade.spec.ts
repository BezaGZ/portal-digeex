import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { Mock, vi } from 'vitest';

import { ResourcesAdminFacade } from './resources-admin-facade';
import { DiscoveryService } from '../../../../core/api/discovery.service';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';

type DiscoveryMock = { search: Mock };
type CommunityApiMock = {
  searchTop: Mock;
  listSubcommunities: Mock;
};

/**
 * Tests de `ResourcesAdminFacade`.
 *
 * Wrapper sobre Discovery con `configuration=administrativeView` para la
 * pantalla `/administrador/recursos`. Resuelve scope per-rol: SuperAdmin
 * sin scope (global), admin_subdireccion con `scope` resuelto desde el
 * sufijo via `searchTop` → `listSubcommunities` → `findCallerSub`. Mapea
 * opciones de UI (withdrawn, entityType, rango de años) a los filtros
 * nativos del Discovery.
 *
 * Ciclo 33 TDD — Sprint 6.
 */
describe('ResourcesAdminFacade', () => {
  let facade: ResourcesAdminFacade;
  let mockDiscovery: DiscoveryMock;
  let mockCommunityApi: CommunityApiMock;

  const rootCommunity = {
    uuid: 'digeex-root-uuid',
    name: 'DIGEEX',
    handle: '123/1',
    metadata: {},
    type: 'community',
  };

  const peacSub = {
    uuid: 'peac-uuid',
    name: 'PEAC',
    handle: '123/2',
    metadata: { 'digeex.sufijo': [{ value: 'PEAC', language: null, authority: null, confidence: -1, place: 0 }] },
    type: 'community',
  };

  const otherSub = {
    uuid: 'eva-uuid',
    name: 'EVA',
    handle: '123/3',
    metadata: { 'digeex.sufijo': [{ value: 'EVA', language: null, authority: null, confidence: -1, place: 0 }] },
    type: 'community',
  };

  function setupWith(caller: { role: string; sufijo: string | null } | null) {
    mockDiscovery = {
      search: vi.fn(() =>
        of({ items: [], facets: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }),
      ),
    };
    mockCommunityApi = {
      searchTop: vi.fn(() => of({ _embedded: { communities: [rootCommunity] } })),
      listSubcommunities: vi.fn(() =>
        of({ _embedded: { subcommunities: [peacSub, otherSub] } }),
      ),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ResourcesAdminFacade,
        { provide: DiscoveryService, useValue: mockDiscovery },
        { provide: CommunityApiService, useValue: mockCommunityApi },
        { provide: AuthCallerService, useValue: { currentCaller$: of(caller) } },
      ],
    });
    facade = TestBed.inject(ResourcesAdminFacade);
  }

  /** Verifica que para superadmin se pase scope=undefined y configuration=administrativeView. */
  it('should call Discovery with administrativeView and without scope when the caller is superadmin', async () => {
    setupWith({ role: 'superadmin', sufijo: null });

    await firstValueFrom(facade.search$({ withdrawn: false }));

    expect(mockDiscovery.search).toHaveBeenCalledTimes(1);
    const params = mockDiscovery.search.mock.calls[0][0];
    expect(params.configuration).toBe('administrativeView');
    expect(params.scope).toBeUndefined();
    expect(mockCommunityApi.searchTop).not.toHaveBeenCalled();
  });

  /** Verifica que para admin_subdireccion el scope se resuelva desde el sufijo del caller. */
  it('should resolve scope from caller sufijo via searchTop + listSubcommunities for admin_subdireccion', async () => {
    setupWith({ role: 'admin_subdireccion', sufijo: 'PEAC' });

    await firstValueFrom(facade.search$({ withdrawn: false }));

    expect(mockCommunityApi.searchTop).toHaveBeenCalled();
    expect(mockCommunityApi.listSubcommunities).toHaveBeenCalledWith('digeex-root-uuid', 0, 100);
    const params = mockDiscovery.search.mock.calls[0][0];
    expect(params.scope).toBe('peac-uuid');
  });

  /** Verifica que withdrawn=true se mapee al filtro f.withdrawn=true,equals. */
  it('should map withdrawn=true to f.withdrawn=true,equals', async () => {
    setupWith({ role: 'superadmin', sufijo: null });

    await firstValueFrom(facade.search$({ withdrawn: true }));

    const params = mockDiscovery.search.mock.calls[0][0];
    expect(params.filters).toEqual(
      expect.arrayContaining([{ name: 'withdrawn', value: 'true', operator: 'equals' }]),
    );
  });

  /** Verifica que entityType=Documento se mapee al filtro f.entityType=Documento,equals. */
  it('should map entityType to f.entityType=value,equals when provided', async () => {
    setupWith({ role: 'superadmin', sufijo: null });

    await firstValueFrom(facade.search$({ withdrawn: false, entityType: 'Documento' }));

    const params = mockDiscovery.search.mock.calls[0][0];
    expect(params.filters).toEqual(
      expect.arrayContaining([
        { name: 'entityType', value: 'Documento', operator: 'equals' },
      ]),
    );
  });

  /** Verifica que dateFrom/dateTo se mapeen al filtro f.dateIssued con rango Solr. */
  it('should map dateFrom and dateTo to f.dateIssued range', async () => {
    setupWith({ role: 'superadmin', sufijo: null });

    await firstValueFrom(
      facade.search$({ withdrawn: false, dateFrom: 2020, dateTo: 2024 }),
    );

    const params = mockDiscovery.search.mock.calls[0][0];
    expect(params.filters).toEqual(
      expect.arrayContaining([
        { name: 'dateIssued', value: '[2020 TO 2024]', operator: 'equals' },
      ]),
    );
  });

  /** Verifica que query, page, size y sort pasen tal cual a Discovery. */
  it('should pass query, page, size and sort straight through to Discovery', async () => {
    setupWith({ role: 'superadmin', sufijo: null });

    await firstValueFrom(
      facade.search$({
        withdrawn: false,
        query: 'manual',
        page: 2,
        size: 50,
        sort: 'dc.title,asc',
      }),
    );

    const params = mockDiscovery.search.mock.calls[0][0];
    expect(params.query).toBe('manual');
    expect(params.page).toBe(2);
    expect(params.size).toBe(50);
    expect(params.sort).toBe('dc.title,asc');
  });

  /** Fail-closed: un admin_subdireccion cuyo sufijo no matchea no ve nada (no "todo"). */
  it('should return empty without calling Discovery when admin_subdireccion sufijo does not match any sub', async () => {
    setupWith({ role: 'admin_subdireccion', sufijo: 'NO_EXISTE' });

    const page = await firstValueFrom(facade.search$({ withdrawn: false }));

    expect(mockDiscovery.search).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
    expect(page.totalElements).toBe(0);
  });

  /** Fail-closed: sin caller (sesión cerrada) no se descarga nada de otras subs. */
  it('should return empty without calling Discovery when there is no caller', async () => {
    setupWith(null);

    const page = await firstValueFrom(facade.search$({ withdrawn: false }));

    expect(mockDiscovery.search).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
    expect(page.totalElements).toBe(0);
  });

  /** Fail-closed: un admin_subdireccion sin sufijo tampoco cae en "ver todo". */
  it('should return empty without calling Discovery when a non-superadmin caller has no sufijo', async () => {
    setupWith({ role: 'admin_subdireccion', sufijo: null });

    const page = await firstValueFrom(facade.search$({ withdrawn: false }));

    expect(mockDiscovery.search).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
  });
});
