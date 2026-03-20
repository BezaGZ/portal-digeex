import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DSpaceApiService } from './dspace-api.service';

/**
 * Tests para DSpaceApiService.
 *
 * Servicio central para integración con DSpace REST API.
 * Verifica URLs correctas, parámetros de paginación, transformación
 * de respuestas HAL+HATEOAS y manejo de errores HTTP.
 *
 * Ciclo 1 TDD - Sprint 3: 12 tests implementados.
 */
describe('DSpaceApiService', () => {
  let service: DSpaceApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DSpaceApiService
      ]
    });

    service = TestBed.inject(DSpaceApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Verifica que no haya requests HTTP pendientes
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ─── Communities ──────────────────────────────────────────

  /** Verifica que getCommunities() use paginación por defecto (page=0, size=20). */
  it('should fetch communities with default pagination', async () => {
    const mockResponse = {
      _embedded: {
        communities: [
          {
            uuid: '123-456',
            name: 'DIGEEX',
            type: 'community',
            metadata: {
              'dc.title': [{ value: 'Dirección General de Educación Extraescolar' }]
            }
          }
        ]
      },
      _links: {
        self: { href: '/api/core/communities?page=0&size=20' }
      },
      page: {
        size: 20,
        totalElements: 1,
        totalPages: 1,
        number: 0
      }
    };

    // ACT
    const promise = new Promise((resolve, reject) => {
      service.getCommunities().subscribe({
        next: (response) => {
          expect(response._embedded['communities'].length).toBe(1);
          expect(response._embedded['communities'][0].name).toBe('DIGEEX');
          expect(response.page.totalElements).toBe(1);
          resolve(response);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /** Verifica que getCommunities() acepte parámetros personalizados de paginación. */
  it('should fetch communities with custom pagination', async () => {
    const mockResponse = {
      _embedded: { communities: [] },
      _links: {},
      page: { size: 50, totalElements: 0, totalPages: 0, number: 2 }
    };

    const promise = new Promise((resolve, reject) => {
      service.getCommunities(2, 50).subscribe({
        next: (response) => {
          expect(response.page.number).toBe(2);
          expect(response.page.size).toBe(50);
          resolve(response);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities?page=2&size=50');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /** Verifica que getCommunity() obtenga una comunidad individual por UUID. */
  it('should fetch community by uuid', async () => {
    const mockCommunity = {
      uuid: '123-456',
      name: 'DIGEEX',
      type: 'community',
      metadata: {
        'dc.title': [{ value: 'Dirección General de Educación Extraescolar' }],
        'dc.description': [{ value: 'Comunidad principal de DIGEEX' }]
      },
      _links: {
        self: { href: '/api/core/communities/123-456' }
      }
    };

    const promise = new Promise((resolve, reject) => {
      service.getCommunity('123-456').subscribe({
        next: (community) => {
          expect(community.uuid).toBe('123-456');
          expect(community.name).toBe('DIGEEX');
          expect(community.type).toBe('community');
          resolve(community);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities/123-456');
    expect(req.request.method).toBe('GET');
    req.flush(mockCommunity);

    await promise;
  });

  /** Verifica que getSubcommunities() obtenga las subcomunidades de una comunidad padre. */
  it('should fetch subcommunities of a community', async () => {
    const mockResponse = {
      _embedded: {
        subcommunities: [
          { uuid: 'sub-1', name: 'Subdirección Educación Básica', type: 'community' },
          { uuid: 'sub-2', name: 'Subdirección Trabajo y Cultura', type: 'community' },
          { uuid: 'sub-3', name: 'Subdirección Investigación', type: 'community' }
        ]
      },
      _links: {},
      page: { totalElements: 3 }
    };

    const promise = new Promise((resolve, reject) => {
      service.getSubcommunities('123-456').subscribe({
        next: (response) => {
          expect(response._embedded['subcommunities'].length).toBe(3);
          expect(response._embedded['subcommunities'][0].name).toBe('Subdirección Educación Básica');
          resolve(response);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities/123-456/subcommunities?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  // ─── Collections ──────────────────────────────────────────

  /** Verifica que getAllCollections() obtenga todas las colecciones del repositorio. */
  it('should fetch all collections', async () => {
    const mockResponse = {
      _embedded: {
        collections: [
          { uuid: 'col-1', name: 'PEAC', type: 'collection' },
          { uuid: 'col-2', name: 'PRONEA', type: 'collection' }
        ]
      },
      _links: {},
      page: { totalElements: 2 }
    };

    const promise = new Promise((resolve, reject) => {
      service.getAllCollections().subscribe({
        next: (response) => {
          expect(response._embedded['collections'].length).toBe(2);
          expect(response._embedded['collections'][0].name).toBe('PEAC');
          resolve(response);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?page=0&size=100');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /** Verifica que getCollection() obtenga una colección individual por UUID. */
  it('should fetch collection by uuid', async () => {
    const mockCollection = {
      uuid: 'col-123',
      name: 'PEAC',
      type: 'collection',
      metadata: {
        'dc.title': [{ value: 'Programa PEAC' }]
      },
      _links: {
        self: { href: '/api/core/collections/col-123' }
      }
    };

    const promise = new Promise((resolve, reject) => {
      service.getCollection('col-123').subscribe({
        next: (collection) => {
          expect(collection.uuid).toBe('col-123');
          expect(collection.name).toBe('PEAC');
          resolve(collection);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections/col-123');
    expect(req.request.method).toBe('GET');
    req.flush(mockCollection);

    await promise;
  });

  /** Verifica que getCollections() obtenga las colecciones de una comunidad específica. */
  it('should fetch collections of a community', async () => {
    const mockResponse = {
      _embedded: {
        collections: [
          { uuid: 'col-1', name: 'PEAC', type: 'collection' },
          { uuid: 'col-2', name: 'PRONEA', type: 'collection' }
        ]
      },
      _links: {},
      page: { totalElements: 2 }
    };

    const promise = new Promise((resolve, reject) => {
      service.getCollections('123-456').subscribe({
        next: (response) => {
          expect(response._embedded['collections'].length).toBe(2);
          resolve(response);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities/123-456/collections?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  // ─── Items ────────────────────────────────────────────────

  /** Verifica que getItems() obtenga los ítems de una colección mediante el endpoint de búsqueda. */
  it('should fetch items from collection', async () => {
    const mockResponse = {
      _embedded: {
        searchResult: {
          _embedded: {
            objects: [
              {
                _embedded: {
                  indexableObject: {
                    uuid: 'item-1',
                    name: 'Guía PEAC 2024',
                    type: 'item'
                  }
                }
              }
            ]
          },
          page: { totalElements: 1 }
        }
      }
    };

    const promise = new Promise((resolve, reject) => {
      service.getItems('col-123').subscribe({
        next: (response) => {
          expect(response._embedded['items'].length).toBe(1);
          expect(response._embedded['items'][0].name).toBe('Guía PEAC 2024');
          resolve(response);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne((request) =>
      request.url.includes('/server/api/discover/search/objects') &&
      request.params.get('scope') === 'col-123'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /** Verifica que getItem() obtenga un ítem individual por UUID. */
  it('should fetch item by uuid', async () => {
    const mockItem = {
      uuid: 'item-123',
      name: 'Guía PEAC 2024',
      type: 'item',
      metadata: {
        'dc.title': [{ value: 'Guía Metodológica PEAC 2024' }],
        'dc.date.issued': [{ value: '2024-01-15' }]
      },
      _links: {
        self: { href: '/api/core/items/item-123' }
      }
    };

    const promise = new Promise((resolve, reject) => {
      service.getItem('item-123').subscribe({
        next: (item) => {
          expect(item.uuid).toBe('item-123');
          expect(item.name).toBe('Guía PEAC 2024');
          resolve(item);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/core/items/item-123');
    expect(req.request.method).toBe('GET');
    req.flush(mockItem);

    await promise;
  });

  // ─── Bitstreams ───────────────────────────────────────────

  /** Verifica que getBitstreams() obtenga los archivos adjuntos de un ítem. */
  it('should fetch bitstreams of an item', async () => {
    const mockBundlesResponse = {
      _embedded: {
        bundles: [
          {
            uuid: 'bundle-1',
            name: 'ORIGINAL',
            _links: {
              self: { href: '/api/core/bundles/bundle-1' }
            }
          }
        ]
      }
    };

    const mockBitstreamsResponse = {
      _embedded: {
        bitstreams: [
          {
            uuid: 'bit-1',
            name: 'guia-peac.pdf',
            sizeBytes: 1024000,
            _links: {
              content: { href: '/api/core/bitstreams/bit-1/content' }
            }
          }
        ]
      },
      page: { totalElements: 1 }
    };

    const promise = new Promise((resolve, reject) => {
      service.getBitstreams('item-123').subscribe({
        next: (response) => {
          expect(response._embedded['bitstreams'].length).toBe(1);
          expect(response._embedded['bitstreams'][0].name).toBe('guia-peac.pdf');
          resolve(response);
        },
        error: reject
      });
    });

    const bundlesReq = httpMock.expectOne('/server/api/core/items/item-123/bundles?page=0&size=20');
    bundlesReq.flush(mockBundlesResponse);

    const bitstreamsReq = httpMock.expectOne('/server/api/core/bundles/bundle-1/bitstreams?page=0&size=20');
    bitstreamsReq.flush(mockBitstreamsResponse);

    await promise;
  });

  // ─── Error Handling ───────────────────────────────────────

  /** Verifica que el servicio maneje correctamente errores HTTP (404, 401, 500, etc.). */
  it('should handle HTTP errors', async () => {
    const errorMessage = 'Not Found';

    try {
      const promise = new Promise((resolve, reject) => {
        service.getCommunity('invalid-uuid').subscribe({
          next: resolve,
          error: reject
        });
      });

      const req = httpMock.expectOne('/server/api/core/communities/invalid-uuid');
      req.flush(errorMessage, { status: 404, statusText: 'Not Found' });

      await promise;
      throw new Error('Should have thrown error');
    } catch (error: unknown) {
      const httpError = error as { status: number; statusText: string };
      expect(httpError.status).toBe(404);
      expect(httpError.statusText).toBe('Not Found');
    }
  });
});
