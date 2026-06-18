import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AdvancedSearch } from './advanced-search';
import { DiscoveryService } from '../../core/api/discovery.service';
import { DSpaceApiService } from '../../core/api/dspace-api.service';
import { CommunityApiService } from '../../core/api/community-api.service';
import { CollectionApiService } from '../../core/api/collection-api.service';
import { SearchFilters } from './models/search-filters.model';
import { ENTITY_TYPE } from '../../core/config/digeex-values.config';
import { SearchStateService } from './services/search-state.service';
import { SearchResult } from '../../core/api/models/discovery.model';

/**
 * Tests de `AdvancedSearch`.
 *
 * Búsqueda avanzada server-side con scope único. El componente requiere
 * selección de scope (programa/subdirección) antes de buscar. Usa un solo
 * request con paginación server-side (page + size) y filtro implícito
 * f.contentType=documento para excluir galería/estadísticas cuando el scope
 * es community o sub-community.
 *
 * Ciclos del Sprint 4. Ajustado en Sprint 6 (Ciclo 37), en Ciclo 37 (Sprint 8) y en Ciclo 9 (Sprint 9).
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
  } as unknown as SearchResult;

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
  } as unknown as SearchResult;

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

    const callArgs = searchSpy.mock.calls[0]?.[0];
    expect(callArgs?.filters).toEqual(
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

    const callArgs = searchSpy.mock.calls[0]?.[0];
    expect(callArgs?.filters).toEqual(
      expect.arrayContaining([
        { name: 'entityType', value: ENTITY_TYPE.DOCUMENTO, operator: 'equals' },
        { name: 'itemtype', value: 'Manual', operator: 'equals' },
        { name: 'audience', value: 'Primaria', operator: 'equals' },
        { name: 'language', value: 'acr', operator: 'equals' },
      ])
    );
  });

  /** Thumbnails y bitstreams (lazy) */

  /**
   * Verifica que el listado de búsqueda sea lazy y no pre-cargue bundles ni bitstreams.
   * El thumbnail usa el endpoint nativo y los bitstreams se consultan solo al click "Descargar".
   */
  it('should NOT pre-load bundles or bitstreams after search (lazy listing)', () => {
    vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'educación' });

    expect(dspaceApi.getBundles).not.toHaveBeenCalled();
    expect(dspaceApi.getBitstreamsFromBundle).not.toHaveBeenCalled();

    const results = component.results();
    expect(results.length).toBe(1);
    // Sin thumbnail embebido, coverImage cae al endpoint nativo /thumbnail.
    expect(results[0].coverImage).toBe('/server/api/core/items/item-001/thumbnail');
    expect(results[0].bitstreams).toEqual([]);
  });

  /** Verifica que el coverImage use el bitstream embebido cuando el item lo trae. */
  it('should use the embedded thumbnail bitstream URL as coverImage when present', () => {
    const itemWithThumb = {
      ...mockSearchResult.items[0],
      uuid: 'item-thumb',
      thumbnail: { uuid: 'thumb-bs-9', name: 'cover.jpg', type: 'bitstream' },
    };
    const result = { ...mockSearchResult, items: [itemWithThumb] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(discoveryService, 'search').mockReturnValue(of(result as any));

    component.onSearch({ ...defaultFilters, query: 'algo' });

    const results = component.results();
    expect(results[0].coverImage).toBe('/server/api/core/bitstreams/thumb-bs-9/content');
  });

  /** owningCollection embebido */

  /** Verifica que la búsqueda pida los embeds thumbnail y owningCollection. */
  it('should request thumbnail and owningCollection embeds on search', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.onSearch({ ...defaultFilters, query: 'x' });

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: ['thumbnail', 'owningCollection'] }),
    );
  });

  /**
   * Verifica que owningCollectionUuid salga del owningCollection embebido en el
   * resultado, sin una petición de owningCollection por item.
   */
  it('should read owningCollectionUuid from the embedded owningCollection without a per-item request', () => {
    const itemWithOwning = {
      ...mockSearchResult.items[0],
      uuid: 'item-own',
      owningCollection: { uuid: 'col-embebida', name: 'Programa', type: 'collection' },
    };
    const result = { ...mockSearchResult, items: [itemWithOwning] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(discoveryService, 'search').mockReturnValue(of(result as any));
    const owningSpy = vi.spyOn(collectionApi, 'getOwningCollectionOfItem');

    component.onSearch({ ...defaultFilters, query: 'x' });

    const results = component.results();
    expect(results[0].owningCollectionUuid).toBe('col-embebida');
    expect(owningSpy).not.toHaveBeenCalled();
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

  /** Carga del dropdown de ámbito */

  /* eslint-disable @typescript-eslint/no-explicit-any -- mocks de respuestas HAL */
  describe('loadScopeOptions', () => {
    const digeexResponse = {
      _embedded: {
        communities: [{ uuid: 'digeex-uuid', name: 'DIGEEX', handle: '', metadata: {}, type: 'community' }],
      },
      page: { size: 10, totalElements: 1, totalPages: 1, number: 0 },
    };

    const subs = [
      { uuid: 'sub-a', name: 'A', metadata: { 'dc.title': [{ value: 'Educación Básica' }] }, type: 'community' },
      { uuid: 'sub-b', name: 'B', metadata: { 'dc.title': [{ value: 'Trabajo y Cultura' }] }, type: 'community' },
    ];

    function buildCol(uuid: string, title: string, entityType: string) {
      return {
        uuid,
        name: title,
        metadata: {
          'dc.title': [{ value: title }],
          'dspace.entity.type': [{ value: entityType }],
        },
        type: 'collection',
      };
    }

    /**
     * Verifica que el dropdown se publique aunque falle la carga de colecciones de una subdirección.
     * Sin tolerancia al fallo, el contador manual nunca llegaba a cero y el dropdown quedaba vacío.
     */
    it('should publish the scope options even when one collections request fails', () => {
      vi.spyOn(communityApi, 'list').mockReturnValue(of(digeexResponse as any));
      vi.spyOn(communityApi, 'listAllSubcommunities').mockReturnValue(of(subs as any));
      vi.spyOn(collectionApi, 'listAllByCommunity').mockImplementation(((uuid: string) =>
        uuid === 'sub-a'
          ? of([buildCol('col-peac', 'PEAC', ENTITY_TYPE.DOCUMENTO)] as any)
          : throwError(() => new Error('500'))) as any);

      (component as any).loadScopeOptions();

      expect(component.scopeOptions().map((o) => o.label)).toEqual([
        'Todos los programas (DIGEEX)',
        'Educación Básica (todos)',
        'PEAC',
        'Trabajo y Cultura (todos)',
      ]);
    });

    it('should list every collection of a subcommunity without a page-size cap', () => {
      const manyCols = Array.from({ length: 25 }, (_, i) =>
        buildCol(`col-${i}`, `Programa ${String(i).padStart(2, '0')}`, ENTITY_TYPE.DOCUMENTO),
      );
      vi.spyOn(communityApi, 'list').mockReturnValue(of(digeexResponse as any));
      vi.spyOn(communityApi, 'listAllSubcommunities').mockReturnValue(of(subs.slice(0, 1) as any));
      vi.spyOn(collectionApi, 'listAllByCommunity').mockReturnValue(of(manyCols as any));

      (component as any).loadScopeOptions();

      // 1 raíz + 1 "(todos)" + las 25 colecciones: nada se recorta a una página.
      expect(component.scopeOptions()).toHaveLength(27);
    });

    /** Verifica el orden estable del dropdown (subdirección + sus programas Documento, galerías excluidas). */
    it('should group only Documento collections under each subcommunity in declaration order', () => {
      vi.spyOn(communityApi, 'list').mockReturnValue(of(digeexResponse as any));
      vi.spyOn(communityApi, 'listAllSubcommunities').mockReturnValue(of(subs as any));
      vi.spyOn(collectionApi, 'listAllByCommunity').mockImplementation(((uuid: string) =>
        uuid === 'sub-a'
          ? of([
              buildCol('col-peac', 'PEAC', ENTITY_TYPE.DOCUMENTO),
              buildCol('col-galeria', 'Galería Institucional', 'Galeria'),
            ] as any)
          : of([buildCol('col-cemucaf', 'CEMUCAF', ENTITY_TYPE.DOCUMENTO)] as any)) as any);

      (component as any).loadScopeOptions();

      expect(component.scopeOptions().map((o) => o.label)).toEqual([
        'Todos los programas (DIGEEX)',
        'Educación Básica (todos)',
        'PEAC',
        'Trabajo y Cultura (todos)',
        'CEMUCAF',
      ]);
    });

    /**
     * Verifica que reentrar a la pantalla sin scope elegido no repita las
     * peticiones del dropdown: las opciones sobreviven en SearchStateService.
     */
    it('should not reload the scope options on init when they are already in the state', () => {
      const listSpy = vi.spyOn(communityApi, 'list');
      listSpy.mockClear();
      const searchState = TestBed.inject(SearchStateService);
      searchState.scopeOptions.set([
        { label: 'Todos los programas (DIGEEX)', value: 'digeex-uuid', scopeType: 'community' },
      ]);

      const fixture2 = TestBed.createComponent(AdvancedSearch);
      fixture2.detectChanges();

      expect(listSpy).not.toHaveBeenCalled();
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /** Persistencia tras volver del detalle */

  describe('persistence after returning from detail', () => {
    /**
     * Verifica que si SearchStateService trae scope al montar, AdvancedSearch reejecute la búsqueda.
     * Caso: el usuario regresa del detalle y debe ver sus resultados sin rehacer scope ni filtros.
     */
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
