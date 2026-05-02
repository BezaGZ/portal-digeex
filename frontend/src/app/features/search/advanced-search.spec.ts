import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AdvancedSearch } from './advanced-search';
import { DiscoveryService } from '../../core/api/discovery.service';
import { DSpaceApiService } from '../../core/api/dspace-api.service';
import { CommunityApiService } from '../../core/api/community-api.service';
import { CollectionApiService } from '../../core/api/collection-api.service';
import { SearchFilters } from './models/search-filters.model';
import { ENTITY_TYPE } from '../../core/config/digeex-values.config';
import { SearchStateService } from './services/search-state.service';

/**
 * Tests para AdvancedSearch — Arquitectura server-side con scope único.
 *
 * El componente requiere selección de scope (programa/subdirección) antes
 * de buscar. Usa un solo request con paginación server-side (page + size)
 * y filtro implícito f.contentType=documento para excluir galería/estadísticas
 * cuando el scope es community o sub-community.
 *
 * Sprint 4 — Refactor facetas server-side
 */
describe('AdvancedSearch', () => {
  let component: AdvancedSearch;
  let discoveryService: DiscoveryService;
  let dspaceApi: DSpaceApiService;
  let communityApi: CommunityApiService;
  let collectionApi: CollectionApiService;

  /** Fixtures */

  const mockSearchResult = {
    items: [
      {
        uuid: 'item-001',
        name: 'Manual de Educación',
        handle: '',
        metadata: {
          'dc.title': [{ value: 'Manual de Educación' }],
          'dc.type': [{ value: 'Manual' }],
        },
        inArchive: true,
        discoverable: true,
        withdrawn: false,
        lastModified: '',
        type: 'item',
      },
    ],
    facets: [
      { name: 'itemtype', values: [{ label: 'Manual', count: 5 }] },
      { name: 'language', values: [{ label: 'es', count: 10 }] },
      { name: 'audience', values: [{ label: 'Primaria', count: 3 }] },
    ],
    totalElements: 1,
    totalPages: 1,
    page: 0,
    size: 10,
  };

  const mockFacetsOnlyResult = {
    items: [],
    facets: [
      { name: 'itemtype', values: [{ label: 'Manual', count: 5 }, { label: 'Guía', count: 3 }] },
      { name: 'language', values: [{ label: 'es', count: 10 }] },
      { name: 'audience', values: [{ label: 'Primaria', count: 3 }] },
    ],
    totalElements: 0,
    totalPages: 0,
    page: 0,
    size: 0,
  };

  const mockBundlesResponse = {
    _embedded: {
      bundles: [
        { uuid: 'thumb-bundle-001', name: 'THUMBNAIL', handle: '', type: 'bundle', _links: {} },
        { uuid: 'orig-bundle-001', name: 'ORIGINAL', handle: '', type: 'bundle', _links: {} },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
  };

  const mockThumbnailBitstreams = {
    _embedded: {
      bitstreams: [
        { uuid: 'thumb-bs-001', name: 'item-001.jpg.jpg', sizeBytes: 5000, _links: {} },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
  };

  const mockOriginalBitstreams = {
    _embedded: {
      bitstreams: [
        { uuid: 'orig-bs-001', name: 'Manual.pdf', sizeBytes: 120000, _links: {} },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
  };

  const defaultFilters: SearchFilters = {
    query: '',
    scope: 'scope-001',
    tipoDocumento: [],
    nivelEducativo: [],
    idioma: [],
    autorArea: '',
    anioInicio: null,
    anioFin: null,
    orderBy: 'relevancia',
  };

  const mockCommunitiesResponse = {
    _embedded: { communities: [] },
    _links: {},
    page: { size: 10, totalElements: 0, totalPages: 0, number: 0 },
  };

  /** Setup */

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdvancedSearch],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdvancedSearch);
    component = fixture.componentInstance;
    discoveryService = TestBed.inject(DiscoveryService);
    dspaceApi = TestBed.inject(DSpaceApiService);
    communityApi = TestBed.inject(CommunityApiService);
    collectionApi = TestBed.inject(CollectionApiService);

    /* Mock community loading to prevent ngOnInit API calls */
    /* eslint-disable @typescript-eslint/no-explicit-any */
    vi.spyOn(communityApi, 'list').mockReturnValue(of(mockCommunitiesResponse as any));
    vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(mockBundlesResponse as any));
    vi.spyOn(collectionApi, 'getOwningCollectionOfItem').mockReturnValue(of({ uuid: 'col-001', name: 'Mock', handle: '', metadata: {}, archivedItemsCount: 0, type: 'collection' } as any));
    vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation((bundleUuid: string) => {
      if (bundleUuid === 'thumb-bundle-001') return of(mockThumbnailBitstreams as any);
      if (bundleUuid === 'orig-bundle-001') return of(mockOriginalBitstreams as any);
      return of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any);
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    fixture.detectChanges();
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  /** Verifica que los signals iniciales estén en estado por defecto. */
  it('should initialize with empty state and no search executed', () => {
    expect(component.isSearching()).toBe(false);
    expect(component.hasSearched()).toBe(false);
    expect(component.results()).toEqual([]);
    expect(component.totalElements()).toBe(0);
  });

  /** Scope y facetas */

  /** Verifica que al cambiar scope se carguen facetas con size=0 y filtro contentType. */
  it('should load facets with size=0 and contentType filter when scope is community', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockFacetsOnlyResult));

    component.onScopeChange('scope-001');

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'scope-001',
        size: 0,
        filters: [{ name: 'entityType', value: ENTITY_TYPE.DOCUMENTO, operator: 'equals' }],
      })
    );
  });

  /** Verifica que al cambiar scope se resetee el estado de búsqueda. */
  it('should reset search state when scope changes', () => {
    component.onScopeChange('scope-001');

    expect(component.hasSearched()).toBe(false);
    expect(component.results()).toEqual([]);
    expect(component.totalElements()).toBe(0);
  });

  /** Búsqueda con scope único y paginación server-side */

  /** Verifica que la búsqueda usa un solo scope con page y size=10 (server-side pagination). */
  it('should search with single scope and server-side pagination (page + size=10)', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'educación' });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'scope-001',
        query: 'educación',
        page: 0,
        size: 10,
      })
    );
  });

  /** Verifica que búsqueda con scope community inyecte f.contentType=documento automáticamente. */
  it('should inject contentType filter when scope is community (default)', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'test' });

    const callArgs = searchSpy.mock.calls[0][0];
    expect(callArgs.filters).toEqual(
      expect.arrayContaining([
        { name: 'entityType', value: ENTITY_TYPE.DOCUMENTO, operator: 'equals' },
      ])
    );
  });

  /** Verifica que la paginación sea server-side (nueva llamada al API). */
  it('should execute new API call on page change (server-side pagination)', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'test' });
    expect(searchSpy).toHaveBeenCalledTimes(1);

    component.onPageChange({ page: 1, first: 10, rows: 10, pageCount: 2 });

    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(searchSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, size: 10 })
    );
  });

  /** Verifica que no se use forkJoin — siempre un solo search call. */
  it('should never use forkJoin — always single search call', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'educación' });

    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  /** Filtrado server-side con f.xxx */

  /** Verifica que se envíen parámetros f.xxx al API. */
  it('should send f.xxx filter params to DSpace API', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({
      ...defaultFilters,
      query: 'test',
      idioma: ['acr'],
      tipoDocumento: ['Manual'],
      nivelEducativo: ['Primaria'],
    });

    const callArgs = searchSpy.mock.calls[0][0];
    expect(callArgs.filters).toEqual(
      expect.arrayContaining([
        { name: 'entityType', value: ENTITY_TYPE.DOCUMENTO, operator: 'equals' },
        { name: 'itemtype', value: 'Manual', operator: 'equals' },
        { name: 'audience', value: 'Primaria', operator: 'equals' },
        { name: 'language', value: 'acr', operator: 'equals' },
      ])
    );
  });

  /** Thumbnails y bitstreams */

  /** Verifica la carga de thumbnails y bitstreams después del search. */
  it('should load thumbnails and bitstreams after search', () => {
    vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'educación' });

    expect(dspaceApi.getBundles).toHaveBeenCalledWith('item-001');
    expect(dspaceApi.getBitstreamsFromBundle).toHaveBeenCalledWith('thumb-bundle-001');
    expect(dspaceApi.getBitstreamsFromBundle).toHaveBeenCalledWith('orig-bundle-001');

    const results = component.results();
    expect(results.length).toBe(1);
    expect(results[0].coverImage).toBe('/server/api/core/bitstreams/thumb-bs-001/content');
    expect(results[0].bitstreams.length).toBe(1);
    expect(results[0].bitstreams[0].url).toBe('/server/api/core/bitstreams/orig-bs-001/content');
  });

  /** onClear */

  /** Verifica que onClear resetee el estado sin ejecutar búsqueda. */
  it('should reset state without executing search when onClear is called', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'test' });
    expect(searchSpy).toHaveBeenCalledTimes(1);

    component.onClear();

    expect(component.hasSearched()).toBe(false);
    expect(component.results()).toEqual([]);
    expect(component.totalElements()).toBe(0);
    // onClear should NOT trigger a new search
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  /** Persistencia tras volver del detalle (Sprint 6) */

  describe('persistencia tras volver del detalle', () => {
    /** Verifica que cuando SearchStateService tiene un scope con valor al
     *  montar el componente (ej: usuario regresó del detalle de un item),
     *  AdvancedSearch dispara automáticamente la búsqueda para repoblar
     *  los resultados sin que el usuario tenga que rehacer scope ni filtros. */
    it('should re-execute search when SearchStateService has a scope on init', () => {
      const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

      const searchState = TestBed.inject(SearchStateService);
      searchState.scope.set('scope-001');
      searchState.scopeType.set('community');
      searchState.filters.set({ ...defaultFilters, query: 'restaurada' });
      searchState.hasSearched.set(true);

      const fixture2 = TestBed.createComponent(AdvancedSearch);
      fixture2.detectChanges();

      expect(searchSpy).toHaveBeenCalled();
      expect(fixture2.componentInstance.hasSearched()).toBe(true);
    });
  });
});
