import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AdvancedSearch } from './advanced-search';
import { DiscoveryService } from '../../core/api/discovery.service';
import { DSpaceApiService } from '../../core/api/dspace-api.service';
import { SearchFilters } from './models/search-filters.model';

/**
 * Tests para AdvancedSearch (página de búsqueda avanzada pública).
 *
 * Componente con barra de búsqueda + filtros dropdown que consume
 * Discovery API con scope por colección. Implementa filtrado
 * client-side y paginación local sobre resultados completos.
 *
 * Ciclo 3 TDD — Sprint 4
 */
describe('AdvancedSearch', () => {
  let component: AdvancedSearch;
  let discoveryService: DiscoveryService;
  let dspaceApi: DSpaceApiService;

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
    facets: [],
    totalElements: 1,
    totalPages: 1,
    page: 0,
    size: 100,
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
    comunidades: [],
    tipoDocumento: [],
    nivelEducativo: [],
    idioma: [],
    autorArea: '',
    anioInicio: null,
    anioFin: null,
    orderBy: 'relevancia',
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

    /* eslint-disable @typescript-eslint/no-explicit-any */
    vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(mockBundlesResponse as any));
    vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation((bundleUuid: string) => {
      if (bundleUuid === 'thumb-bundle-001') return of(mockThumbnailBitstreams as any);
      if (bundleUuid === 'orig-bundle-001') return of(mockOriginalBitstreams as any);
      return of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    });
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  /** Verifica que los signals iniciales estén en estado por defecto. */
  it('should render search bar and filter dropdowns', () => {
    expect(component.isSearching()).toBe(false);
    expect(component.hasSearched()).toBe(false);
    expect(component.results()).toEqual([]);
    expect(component.totalElements()).toBe(0);
  });

  /** Búsqueda con scope por colección */

  /** Verifica que forkJoin envíe un search por cada colección cuando se seleccionan todas. */
  it('should use forkJoin with scope per collection when all programs are selected', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.documentCollectionUuids.set(['col-001', 'col-002']);
    component.onSearch({ ...defaultFilters, query: 'educación' });

    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'educación', scope: 'col-001', size: 100 })
    );
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'educación', scope: 'col-002', size: 100 })
    );
  });

  /** Verifica que se use un solo scope cuando se selecciona una comunidad. */
  it('should use scope when only one program is selected', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.documentCollectionUuids.set(['col-001', 'col-002']);
    component.onSearch({ ...defaultFilters, query: 'educación', comunidades: ['col-001'] });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'educación', scope: 'col-001', size: 100 })
    );
  });

  /** Verifica que forkJoin envíe search por cada colección del subconjunto seleccionado. */
  it('should use forkJoin when a subset of programs is selected', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.documentCollectionUuids.set(['col-001', 'col-002', 'col-003']);
    component.onSearch({ ...defaultFilters, query: 'educación', comunidades: ['col-001', 'col-002'] });

    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'col-001' })
    );
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'col-002' })
    );
  });

  /** Thumbnails, bitstreams y paginación */

  /** Verifica la carga de thumbnails y bitstreams después del search (patrón program-view). */
  it('should load thumbnails and bitstreams after search (patrón program-view)', () => {
    vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.documentCollectionUuids.set(['col-001']);
    component.onSearch({ ...defaultFilters, query: 'educación', comunidades: ['col-001'] });

    expect(dspaceApi.getBundles).toHaveBeenCalledWith('item-001');
    expect(dspaceApi.getBitstreamsFromBundle).toHaveBeenCalledWith('thumb-bundle-001');
    expect(dspaceApi.getBitstreamsFromBundle).toHaveBeenCalledWith('orig-bundle-001');

    const results = component.results();
    expect(results.length).toBe(1);
    expect(results[0].coverImage).toBe('/server/api/core/bitstreams/thumb-bs-001/content');
    expect(results[0].bitstreams.length).toBe(1);
    expect(results[0].bitstreams[0].url).toBe('/server/api/core/bitstreams/orig-bs-001/content');
  });

  /** Verifica que la paginación sea client-side sin nuevas llamadas al API. */
  it('should paginate client-side without new API calls', () => {
    const manyItems = Array.from({ length: 15 }, (_, i) => ({
      uuid: `item-${i}`,
      name: `Doc ${i}`,
      handle: '',
      metadata: { 'dc.title': [{ value: `Doc ${i}` }] },
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '',
      type: 'item',
    }));

    const bigResult = { items: manyItems, facets: [], totalElements: 15, totalPages: 1, page: 0, size: 100 };
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(bigResult));

    component.documentCollectionUuids.set(['col-001']);
    component.onSearch({ ...defaultFilters, query: 'test', comunidades: ['col-001'] });

    expect(component.results().length).toBe(10);
    expect(component.totalElements()).toBe(15);
    expect(searchSpy).toHaveBeenCalledTimes(1);

    component.onPageChange({ page: 1, first: 10, rows: 10, pageCount: 2 });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(component.results().length).toBe(5);
  });

  /** Filtrado client-side */

  /** Verifica que onClear() re-ejecute la búsqueda sin query. */
  it('should re-execute search when onClear is called', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.documentCollectionUuids.set(['col-001']);
    component.onSearch({ ...defaultFilters, query: 'test', comunidades: ['col-001'] });
    expect(searchSpy).toHaveBeenCalledTimes(1);

    component.onClear();
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(searchSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'col-001', query: undefined })
    );
  });

  /** Verifica que NO se envíen parámetros f.xxx al API (filtrado client-side). */
  it('should NOT send f.xxx filter params to DSpace API (client-side filtering)', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.documentCollectionUuids.set(['col-001']);
    component.onSearch({
      ...defaultFilters,
      query: 'test',
      comunidades: ['col-001'],
      idioma: ['acr'],
      tipoDocumento: ['Manual'],
      nivelEducativo: ['Primaria'],
    });

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'test', scope: 'col-001', size: 100 })
    );
    const callArgs = searchSpy.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('filters');
  });

  /** Verifica el filtrado client-side por campos de metadata (idioma, tipo, etc.). */
  it('should filter items client-side by metadata fields', () => {
    const itemsWithMetadata = [
      {
        uuid: 'item-es', name: 'Doc Español', handle: '', type: 'item',
        inArchive: true, discoverable: true, withdrawn: false, lastModified: '',
        metadata: {
          'dc.title': [{ value: 'Doc Español' }],
          'dc.type': [{ value: 'Manual' }],
          'dc.language.iso': [{ value: 'es' }],
          'dc.audience': [{ value: 'Primaria' }],
        },
      },
      {
        uuid: 'item-acr', name: 'Doc Achi', handle: '', type: 'item',
        inArchive: true, discoverable: true, withdrawn: false, lastModified: '',
        metadata: {
          'dc.title': [{ value: 'Doc Achi' }],
          'dc.type': [{ value: 'Guía' }],
          'dc.language.iso': [{ value: 'acr' }],
          'dc.audience': [{ value: 'Básico' }],
        },
      },
      {
        uuid: 'item-en', name: 'Doc English', handle: '', type: 'item',
        inArchive: true, discoverable: true, withdrawn: false, lastModified: '',
        metadata: {
          'dc.title': [{ value: 'Doc English' }],
          'dc.type': [{ value: 'Manual' }],
          'dc.language.iso': [{ value: 'en' }],
          'dc.audience': [{ value: 'Diversificado' }],
        },
      },
    ];

    const resultWith3 = { items: itemsWithMetadata, facets: [], totalElements: 3, totalPages: 1, page: 0, size: 100 };
    vi.spyOn(discoveryService, 'search').mockReturnValue(of(resultWith3));

    component.documentCollectionUuids.set(['col-001']);

    component.onSearch({
      ...defaultFilters,
      comunidades: ['col-001'],
      idioma: ['acr'],
    });

    expect(component.totalElements()).toBe(1);
    expect(component.results().length).toBe(1);
    expect(component.results()[0].name).toBe('Doc Achi');
  });
});
