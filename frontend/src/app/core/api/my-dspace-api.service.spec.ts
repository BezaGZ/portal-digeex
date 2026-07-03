import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { MyDSpaceApiService } from './my-dspace-api.service';
import { Paginated } from './models/hal.model';
import { MyDSpaceObject } from './models/my-dspace.model';

/**
 * Tests de MyDSpaceApiService.
 *
 * Wrapper HTTP del endpoint canónico de MyDSpace de DSpace 9
 * (`/api/discover/search/objects?configuration=workspace`), que es el
 * mismo que usa dspace-angular para la bandeja personal del usuario.
 * El response trae los resultados envueltos en
 * `_embedded.searchResult._embedded.objects` con `type=discover` por
 * fuera y el item, workspaceitem o workflowitem real en
 * `_embedded.indexableObject`; el wrapper aplana esa envoltura a
 * `Paginated<MyDSpaceObject>` para que la UI no tenga que conocer HAL.
 *
 * Ciclo 37 TDD — Sprint 6. Ajustado en Ciclo 56 (Sprint 10).
 */
describe('MyDSpaceApiService', () => {
  let service: MyDSpaceApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), MyDSpaceApiService],
    });
    service = TestBed.inject(MyDSpaceApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Verifica el GET al endpoint MyDSpace con configuration=workspace y el aplanado del wrapper HAL a Paginated<MyDSpaceObject>. */
  it('should GET /api/discover/search/objects with configuration=workspace and map the wrapped response to Paginated<MyDSpaceObject>', () => {
    let result: Paginated<MyDSpaceObject> | undefined;
    service.search$(1, 20).subscribe((p) => (result = p));

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/server/api/discover/search/objects' &&
        r.params.get('configuration') === 'workspace' &&
        r.params.get('embed') === 'thumbnail,owningCollection' &&
        r.params.get('page') === '1' &&
        r.params.get('size') === '20',
    );
    expect(req.request.method).toBe('GET');

    req.flush({
      _embedded: {
        searchResult: {
          page: { size: 20, totalElements: 25, totalPages: 2, number: 1 },
          _embedded: {
            objects: [
              {
                hitHighlights: null,
                type: 'discover',
                _links: { indexableObject: { href: '...' } },
                _embedded: {
                  indexableObject: {
                    uuid: 'item-a',
                    name: 'Item A',
                    handle: '123/1',
                    metadata: {
                      'dc.title': [
                        { value: 'Item A', language: null, authority: null, confidence: -1, place: 0 },
                      ],
                    },
                    inArchive: true,
                    discoverable: true,
                    withdrawn: false,
                    lastModified: '2026-05-11T00:00:00Z',
                    type: 'item',
                  },
                },
              },
            ],
          },
        },
      },
    });

    expect(result?.totalElements).toBe(25);
    expect(result?.totalPages).toBe(2);
    expect(result?.size).toBe(20);
    expect(result?.page).toBe(1);
    expect(result?.items.length).toBe(1);
    expect(result?.items[0].indexableObject.uuid).toBe('item-a');
  });

  /** Verifica que el thumbnail embebido se suba al campo top-level del Item para que el template arme la URL del bitstream. */
  it('should lift the embedded thumbnail bitstream from indexableObject._embedded to indexableObject.thumbnail', () => {
    let result: Paginated<MyDSpaceObject> | undefined;
    service.search$(0, 20).subscribe((p) => (result = p));

    const req = httpMock.expectOne(
      (r) => r.url === '/server/api/discover/search/objects',
    );
    req.flush({
      _embedded: {
        searchResult: {
          page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
          _embedded: {
            objects: [
              {
                hitHighlights: null,
                type: 'discover',
                _links: { indexableObject: { href: '...' } },
                _embedded: {
                  indexableObject: {
                    uuid: 'item-thumb',
                    name: 'Con portada',
                    handle: '123/9',
                    metadata: {},
                    inArchive: true,
                    discoverable: true,
                    withdrawn: false,
                    lastModified: '2026-05-11T00:00:00Z',
                    type: 'item',
                    _embedded: {
                      thumbnail: { uuid: 'thumb-uuid-9', name: 'cover.jpg', type: 'bitstream' },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });

    expect(result?.items[0].indexableObject.thumbnail?.uuid).toBe('thumb-uuid-9');
  });

  /**
   * Verifica que el owningCollection embebido se suba al top-level del Item.
   * La acción "Ver" de Mis envíos arma la URL pública con ese uuid sin una petición por item.
   */
  it('should lift the embedded owningCollection from indexableObject._embedded to indexableObject.owningCollection', () => {
    let result: Paginated<MyDSpaceObject> | undefined;
    service.search$(0, 20).subscribe((p) => (result = p));

    const req = httpMock.expectOne(
      (r) => r.url === '/server/api/discover/search/objects',
    );
    req.flush({
      _embedded: {
        searchResult: {
          page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
          _embedded: {
            objects: [
              {
                hitHighlights: null,
                type: 'discover',
                _links: { indexableObject: { href: '...' } },
                _embedded: {
                  indexableObject: {
                    uuid: 'item-col',
                    name: 'Con programa',
                    handle: '123/10',
                    metadata: {},
                    inArchive: true,
                    discoverable: true,
                    withdrawn: false,
                    lastModified: '2026-05-11T00:00:00Z',
                    type: 'item',
                    _embedded: {
                      owningCollection: { uuid: 'col-10', name: 'Programa X', type: 'collection' },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });

    expect(result?.items[0].indexableObject.owningCollection?.uuid).toBe('col-10');
  });

  /** Verifica que objetos con `_embedded.indexableObject` vacío se filtren del response. */
  it('should drop ghost objects with empty indexableObject (no uuid) from the response', () => {
    let result: Paginated<MyDSpaceObject> | undefined;
    service.search$(0, 20).subscribe((p) => (result = p));

    const req = httpMock.expectOne(
      (r) => r.url === '/server/api/discover/search/objects',
    );
    req.flush({
      _embedded: {
        searchResult: {
          page: { size: 20, totalElements: 3, totalPages: 1, number: 0 },
          _embedded: {
            objects: [
              {
                type: 'discover',
                _embedded: {
                  indexableObject: {
                    uuid: 'real-1',
                    name: 'Real 1',
                    handle: '123/1',
                    metadata: {},
                    inArchive: true,
                    discoverable: true,
                    withdrawn: false,
                    lastModified: '2026-05-11T00:00:00Z',
                    type: 'item',
                  },
                },
              },
              {
                type: null,
                _embedded: { indexableObject: {} },
              },
              {
                type: 'discover',
                _embedded: {
                  indexableObject: {
                    uuid: 'real-2',
                    name: 'Real 2',
                    handle: '123/2',
                    metadata: {},
                    inArchive: true,
                    discoverable: true,
                    withdrawn: false,
                    lastModified: '2026-05-11T00:00:00Z',
                    type: 'item',
                  },
                },
              },
            ],
          },
        },
      },
    });

    expect(result?.items.length).toBe(2);
    expect(result?.items.map((o) => o.indexableObject.uuid)).toEqual(['real-1', 'real-2']);
  });

  /** Verifica que con opts el wrapper agregue los params nativos del workspace bean: query, f.dateIssued y sort. */
  it('should append query, f.dateIssued range and sort when opts are provided', () => {
    service
      .search$(0, 20, { query: 'reporte', dateFrom: 2020, dateTo: 2024, sort: 'dc.title,asc' })
      .subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/server/api/discover/search/objects' &&
        r.params.get('query') === 'reporte' &&
        r.params.get('f.dateIssued') === '[2020 TO 2024],equals' &&
        r.params.get('sort') === 'dc.title,asc',
    );
    expect(req.request.method).toBe('GET');

    req.flush({
      _embedded: {
        searchResult: {
          page: { size: 20, totalElements: 0, totalPages: 0, number: 0 },
          _embedded: { objects: [] },
        },
      },
    });
  });
});
