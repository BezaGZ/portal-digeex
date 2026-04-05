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
 * Ciclo 1 TDD — Sprint 4 (RED).
 */
describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let httpMock: HttpTestingController;

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
    },
    _links: {
      self: { href: '/api/discover/search/objects' },
    },
  };

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

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

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
});
