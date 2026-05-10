import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DSpaceApiService } from './dspace-api.service';

/**
 * Tests para DSpaceApiService.
 *
 * Servicio HTTP para Items (búsqueda y getOne) y Bitstreams (bundles,
 * descarga del bundle ORIGINAL, thumbnail). Verifica URLs correctas,
 * parámetros de paginación, transformación de respuestas HAL+HATEOAS y
 * manejo de errores HTTP.
 *
 * Ciclo 1 TDD — Sprint 3
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
    httpMock.verify();
  });

  /** Verifica que el servicio se instancie correctamente vía DI. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** Items */

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

  /** Verifica que getItems incluya embed=thumbnail y mapee el bitstream embebido a item.thumbnail. */
  it('should request items with embed=thumbnail and surface the embedded bitstream on each item', async () => {
    const mockResponse = {
      _embedded: {
        searchResult: {
          _embedded: {
            objects: [
              {
                _embedded: {
                  indexableObject: {
                    uuid: 'item-1',
                    name: 'Item con portada',
                    type: 'item',
                    _embedded: {
                      thumbnail: {
                        uuid: 'thumb-bs-1',
                        name: 'portada.jpg',
                        type: 'bitstream',
                      },
                    },
                  },
                },
              },
            ],
          },
          page: { totalElements: 1 },
        },
      },
    };

    const promise = new Promise((resolve, reject) => {
      service.getItems('col-123').subscribe({
        next: (response) => {
          expect(response._embedded['items'][0].thumbnail?.uuid).toBe('thumb-bs-1');
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      (request) =>
        request.url.includes('/server/api/discover/search/objects') &&
        request.params.get('embed') === 'thumbnail',
    );
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

  /** Bitstreams */

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

  /** Error Handling */

  /** Verifica que el servicio maneje correctamente errores HTTP (404, 401, 500, etc.). */
  it('should handle HTTP errors', async () => {
    const errorMessage = 'Not Found';

    try {
      const promise = new Promise((resolve, reject) => {
        service.getItem('invalid-uuid').subscribe({
          next: resolve,
          error: reject
        });
      });

      const req = httpMock.expectOne('/server/api/core/items/invalid-uuid');
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
