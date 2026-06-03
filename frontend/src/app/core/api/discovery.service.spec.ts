import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DiscoveryService } from './discovery.service';

/**
 * Tests para DiscoveryService.
 *
 * Cliente dedicado para el endpoint Discovery de DSpace
 * (`/api/discover/search/objects`). Soporta query de texto
 * y filtros por facetas.
 *
 * Ciclos 1, 37 TDD — Sprints 4, 6. Ajustado en Ciclo 11 (Sprint 8).
 */
describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let httpMock: HttpTestingController;

  /** Fixtures */

  const mockSearchResponse = {
    _embedded: {
      searchResult: {
        _embedded: {
          objects: [
            {
              _embedded: {
                indexableObject: {
                  uuid: 'item-001',
                  name: 'Manual de Educación',
                  type: 'item',
                  metadata: {
                    'dc.title': [{ value: 'Manual de Educación' }],
                    'dc.type': [{ value: 'Manual' }],
                  },
                },
              },
              _links: { self: { href: '' } },
              hitHighlights: {},
            },
          ],
        },
        page: {
          size: 20,
          totalElements: 1,
          totalPages: 1,
          number: 0,
        },
      },
      facets: [
        {
          name: 'type',
          facetType: 'text',
          _embedded: {
            values: [{ label: 'Manual', count: 1, _links: { self: { href: '' } } }],
          },
          _links: { self: { href: '' } },
        },
      ],
    },
    _links: {
      self: { href: '/api/discover/search/objects' },
    },
  };

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DiscoveryService,
      ],
    });

    service = TestBed.inject(DiscoveryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Verifica que el servicio se instancie correctamente. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** Verifica que search() envíe el parámetro query al endpoint Discovery. */
  it('should search items with query parameter', async () => {
    const promise = new Promise((resolve, reject) => {
      service.search({ query: 'educación' }).subscribe({
        next: (result) => {
          expect(result.items.length).toBe(1);
          expect(result.items[0].name).toBe('Manual de Educación');
          expect(result.totalElements).toBe(1);
          resolve(result);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne((r) =>
      r.url === '/server/api/discover/search/objects' &&
      r.params.get('query') === 'educación'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockSearchResponse);

    await promise;
  });

  /** Verifica que search() aplique filtros de facetas como f.type=Manual,equals. */
  it('should apply facet filters', async () => {
    const promise = new Promise((resolve, reject) => {
      service.search({
        filters: [
          { name: 'type', value: 'Manual', operator: 'equals' },
        ],
      }).subscribe({
        next: (result) => {
          expect(result.items.length).toBe(1);
          resolve(result);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne((r) =>
      r.url === '/server/api/discover/search/objects' &&
      r.params.get('f.type') === 'Manual,equals'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockSearchResponse);

    await promise;
  });

  /** Verifica que search() pase el param configuration cuando se provee. */
  it('should pass configuration param to the backend when provided', async () => {
    service.search({ configuration: 'administrativeView' }).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/server/api/discover/search/objects' &&
        r.params.get('configuration') === 'administrativeView',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockSearchResponse);
  });

  /** Verifica que search() pida embed=thumbnail al endpoint Discovery. */
  it('should request embed=thumbnail on every search', async () => {
    service.search({}).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/server/api/discover/search/objects' &&
        r.params.get('embed') === 'thumbnail',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockSearchResponse);
  });

  /** Verifica que el thumbnail embebido se levante al campo top-level de cada item. */
  it('should lift _embedded.thumbnail of each indexableObject to item.thumbnail', async () => {
    const promise = new Promise((resolve, reject) => {
      service.search({}).subscribe({
        next: (result) => {
          expect(result.items[0].thumbnail?.uuid).toBe('thumb-bs-1');
          resolve(result);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne((r) => r.url === '/server/api/discover/search/objects');
    req.flush({
      _embedded: {
        searchResult: {
          _embedded: {
            objects: [
              {
                _embedded: {
                  indexableObject: {
                    uuid: 'item-with-thumb',
                    name: 'Con portada',
                    type: 'item',
                    metadata: {},
                    _embedded: {
                      thumbnail: { uuid: 'thumb-bs-1', name: 'cover.jpg', type: 'bitstream' },
                    },
                  },
                },
                _links: { self: { href: '' } },
                hitHighlights: {},
              },
            ],
          },
          page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
        },
        facets: [],
      },
      _links: { self: { href: '' } },
    });

    await promise;
  });

  /**
   * Verifica que el mapeo de facets preserve el campo `authorityKey` cuando
   * DSpace lo provee. Los facets cuyos valores son DSO (collections, communities)
   * incluyen el UUID en ese campo; los facets sobre metadata pura
   * (entityType, language) lo omiten y el mapeo lo deja `undefined`.
   */
  it('should preserve authorityKey on facet values when DSpace provides it and leave it undefined otherwise', async () => {
    let result: { facets: { name: string; values: { label: string; count: number; authorityKey?: string }[] }[] } | null = null;
    const promise = new Promise<void>((resolve, reject) => {
      service.search({ query: 'test' }).subscribe({
        next: (r) => {
          result = r as typeof result;
          resolve();
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne((r) => r.url === '/server/api/discover/search/objects');
    req.flush({
      _embedded: {
        searchResult: {
          _embedded: { objects: [] },
          page: { size: 20, totalElements: 0, totalPages: 0, number: 0 },
        },
        facets: [
          {
            name: 'collection',
            facetType: 'standard',
            _embedded: {
              values: [
                {
                  label: 'PEAC',
                  count: 45,
                  authorityKey: 'coll-uuid-peac',
                  _links: { self: { href: '' } },
                },
                {
                  label: 'PRONEA',
                  count: 12,
                  authorityKey: 'coll-uuid-pronea',
                  _links: { self: { href: '' } },
                },
              ],
            },
            _links: { self: { href: '' } },
          },
          {
            name: 'entityType',
            facetType: 'text',
            _embedded: {
              values: [{ label: 'Documento', count: 53, _links: { self: { href: '' } } }],
            },
            _links: { self: { href: '' } },
          },
        ],
      },
      _links: { self: { href: '' } },
    });

    await promise;

    expect(result).not.toBeNull();
    const collFacet = result!.facets.find((f) => f.name === 'collection');
    expect(collFacet).toBeDefined();
    expect(collFacet!.values[0].authorityKey).toBe('coll-uuid-peac');
    expect(collFacet!.values[1].authorityKey).toBe('coll-uuid-pronea');

    const typeFacet = result!.facets.find((f) => f.name === 'entityType');
    expect(typeFacet).toBeDefined();
    expect(typeFacet!.values[0].authorityKey).toBeUndefined();
  });
});
