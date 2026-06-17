import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GalleryService } from './gallery.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { ENTITY_TYPE } from '../../../core/config/digeex-values.config';

/**
 * Tests para GalleryService.
 *
 * Servicio de galería institucional que busca álbumes dentro de la
 * colección con dspace.entity.type = 'galeria'. Verifica la carga paginada de
 * álbumes con facetas, la carga de un álbum individual con sus fotos,
 * la obtención de opciones de filtro y el mapeo de metadata Dublin Core + digeex.
 *
 * Ciclo 8 TDD — Sprint 4. Ajustado en Ciclo 26 (Sprint 8) y Ciclos 2, 5, 7 (Sprint 9).
 */
describe('GalleryService', () => {
  let service: GalleryService;
  let httpMock: HttpTestingController;

  /** Setup */

  const mockCollectionsResponse = {
    _embedded: {
      collections: [
        {
          uuid: 'col-galeria',
          name: 'Galería Institucional',
          type: 'collection',
          metadata: {
            'dspace.entity.type': [{ value: ENTITY_TYPE.GALERIA }],
          },
        },
      ],
    },
    _links: {},
    page: { size: 100, totalElements: 1, totalPages: 1, number: 0 },
  };

  const mockDiscoveryResponse = {
    _embedded: {
      searchResult: {
        _embedded: {
          objects: [
            {
              _embedded: {
                indexableObject: {
                  uuid: 'album-1',
                  name: 'Graduación PEAC 2024',
                  type: 'item',
                  metadata: {
                    'dc.title': [{ value: 'Graduación PEAC 2024' }],
                    'dc.description.abstract': [{ value: 'Ceremonia de graduación' }],
                    'dc.date.issued': [{ value: '2024-11-15' }],
                    'dc.subject.classification': [{ value: 'PEAC' }],
                    'dc.type': [{ value: 'graduacion' }],
                    'dc.contributor.author': [{ value: 'DIGEEX' }],
                    'dc.publisher': [{ value: 'MINEDUC' }],
                    'digeex.populationType': [{ value: 'jovenes' }],
                    'digeex.imageFocus': [{ value: 'interior' }],
                    'dc.subject': [
                      { value: 'educación' },
                      { value: 'graduación' },
                    ],
                  },
                },
              },
            },
          ],
        },
        _links: {},
        page: { size: 6, totalElements: 1, totalPages: 1, number: 0 },
      },
      facets: [],
    },
  };

  const mockBundlesResponse = {
    _embedded: {
      bundles: [
        {
          uuid: 'bundle-thumbnail',
          name: 'THUMBNAIL',
          _links: { self: { href: '/api/core/bundles/bundle-thumbnail' } },
        },
        {
          uuid: 'bundle-original',
          name: 'ORIGINAL',
          _links: { self: { href: '/api/core/bundles/bundle-original' } },
        },
      ],
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DSpaceApiService,
        DiscoveryService,
        CollectionCacheService,
        GalleryService,
      ],
    });

    service = TestBed.inject(GalleryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** searchAlbums — carga paginada con facetas */

  /** Verifica que searchAlbums() encuentre la colección 'galeria' y devuelva álbumes mapeados. */
  it('should search albums in the gallery collection', async () => {
    const promise = new Promise((resolve, reject) => {
      service.searchAlbums({}, 0, 6).subscribe({
        next: (page) => {
          expect(page.albums.length).toBe(1);
          expect(page.albums[0].title).toBe('Graduación PEAC 2024');
          expect(page.albums[0].program).toBe('PEAC');
          expect(page.albums[0].photoCount).toBe(3);
          expect(page.totalElements).toBe(1);
          resolve(page);
        },
        error: reject,
      });
    });

    /** 1) Caché de colecciones. */
    const collectionsReq = httpMock.expectOne('/server/api/core/collections?page=0&size=100&embed=logo');
    collectionsReq.flush(mockCollectionsResponse);

    /** 2) Discovery con scope = col-galeria. */
    const discoveryReq = httpMock.expectOne((req) =>
      req.url.includes('/server/api/discover/search/objects') &&
      req.params.get('scope') === 'col-galeria'
    );
    discoveryReq.flush(mockDiscoveryResponse);

    /**
     * 3) Bundles del álbum con bitstreams embebidos. El conteo de fotos sale
     * de ORIGINAL._embedded.bitstreams.page.totalElements en esta misma
     * respuesta (embed.size=bitstreams=1 cappa el payload sin afectar el total),
     * así desaparece la petición separada de conteo.
     */
    const bundlesReq = httpMock.expectOne((req) =>
      req.url === '/server/api/core/items/album-1/bundles' &&
      req.params.get('embed') === 'bitstreams' &&
      req.params.get('embed.size') === 'bitstreams=1'
    );
    bundlesReq.flush({
      _embedded: {
        bundles: [
          { uuid: 'bundle-thumbnail', name: 'THUMBNAIL', _links: { self: { href: '/api/core/bundles/bundle-thumbnail' } } },
          {
            uuid: 'bundle-original',
            name: 'ORIGINAL',
            _links: { self: { href: '/api/core/bundles/bundle-original' } },
            _embedded: { bitstreams: { page: { totalElements: 3 } } },
          },
        ],
      },
    });

    await promise;
  });

  /** Verifica que searchAlbums() devuelva página vacía cuando Discovery no encuentra ítems. */
  it('should return empty page when discovery returns no items', async () => {
    const emptyDiscoveryResponse = {
      _embedded: {
        searchResult: {
          _embedded: { objects: [] },
          _links: {},
          page: { totalElements: 0, totalPages: 0 },
        },
        facets: [],
      },
    };

    const promise = new Promise((resolve, reject) => {
      service.searchAlbums({}, 0, 6).subscribe({
        next: (page) => {
          expect(page.albums.length).toBe(0);
          expect(page.totalElements).toBe(0);
          resolve(page);
        },
        error: reject,
      });
    });

    httpMock.expectOne('/server/api/core/collections?page=0&size=100&embed=logo').flush(mockCollectionsResponse);
    httpMock
      .expectOne((req) => req.url.includes('/server/api/discover/search/objects'))
      .flush(emptyDiscoveryResponse);

    await promise;
  });

  /** Verifica que searchAlbums() pase los filtros de faceta al Discovery. */
  it('should send facet filters to discovery when filters are applied', async () => {
    const promise = new Promise((resolve, reject) => {
      service
        .searchAlbums(
          {
            programs: ['PEAC'],
            eventTypes: ['graduacion'],
            populationTypes: ['jovenes'],
            imageContexts: ['interior'],
          },
          0,
          6,
        )
        .subscribe({ next: resolve, error: reject });
    });

    httpMock.expectOne('/server/api/core/collections?page=0&size=100&embed=logo').flush(mockCollectionsResponse);

    const discoveryReq = httpMock.expectOne((req) =>
      req.url.includes('/server/api/discover/search/objects')
    );

    const params = discoveryReq.request.params;
    const fValues = params.getAll('f.classification') || [];
    expect(fValues.some((v) => v.includes('PEAC'))).toBe(true);

    discoveryReq.flush({
      _embedded: {
        searchResult: {
          _embedded: { objects: [] },
          _links: {},
          page: { totalElements: 0, totalPages: 0 },
        },
        facets: [],
      },
    });

    await promise;
  });

  /** Verifica que searchAlbums() capture errores y devuelva página vacía. */
  it('should handle errors gracefully and return empty page', async () => {
    const promise = new Promise((resolve, reject) => {
      service.searchAlbums({}, 0, 6).subscribe({
        next: (page) => {
          expect(page.albums.length).toBe(0);
          expect(page.totalElements).toBe(0);
          resolve(page);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?page=0&size=100&embed=logo');
    req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

    await promise;
  });

  /** getAlbumById — álbum individual con sus fotos */

  const mockAlbumItem = {
    uuid: 'album-1',
    name: 'Graduación PEAC 2024',
    type: 'item',
    metadata: {
      'dc.title': [{ value: 'Graduación PEAC 2024' }],
      'dc.description': [{ value: 'Descripción del álbum' }],
      'dc.date.issued': [{ value: '2024-11-15' }],
    },
  };

  /**
   * Verifica que getAlbumById() filtre las fotos por extensión y no pida el
   * bundle THUMBNAIL: el visor no muestra portada, así que esa petición sobra.
   */
  it('should load an album by id with its photos and without fetching the cover', async () => {
    let album: { title: string; photos: { id: string }[] } | undefined;
    const promise = new Promise<void>((resolve, reject) => {
      service.getAlbumById('album-1').subscribe({
        next: (a) => {
          album = a as typeof album;
          resolve();
        },
        error: reject,
      });
    });

    httpMock.expectOne('/server/api/core/items/album-1').flush(mockAlbumItem);
    httpMock.expectOne('/server/api/core/items/album-1/bundles?page=0&size=20').flush(mockBundlesResponse);
    httpMock.expectOne('/server/api/core/bundles/bundle-original/bitstreams?page=0&size=100').flush({
      _embedded: {
        bitstreams: [
          { uuid: 'photo-1', name: 'foto-01.jpg', _links: { content: { href: '' } } },
          { uuid: 'photo-2', name: 'foto-02.png', _links: { content: { href: '' } } },
          { uuid: 'not-image', name: 'readme.txt', _links: { content: { href: '' } } },
        ],
      },
      page: { number: 0, size: 100, totalPages: 1, totalElements: 3 },
    });
    httpMock.expectNone('/server/api/core/bundles/bundle-thumbnail/bitstreams?page=0&size=20');

    await promise;
    expect(album?.title).toBe('Graduación PEAC 2024');
    expect(album?.photos.length).toBe(2);
    expect(album?.photos[0].id).toBe('photo-1');
  });

  /** Verifica que getAlbumById() agote las páginas del bundle ORIGINAL para traer todas las fotos. */
  it('should fetch all photos across pages of the ORIGINAL bundle', async () => {
    let album: { photos: { id: string }[] } | undefined;
    const promise = new Promise<void>((resolve, reject) => {
      service.getAlbumById('album-1').subscribe({
        next: (a) => {
          album = a as typeof album;
          resolve();
        },
        error: reject,
      });
    });

    httpMock.expectOne('/server/api/core/items/album-1').flush(mockAlbumItem);
    httpMock.expectOne('/server/api/core/items/album-1/bundles?page=0&size=20').flush(mockBundlesResponse);
    httpMock.expectOne('/server/api/core/bundles/bundle-original/bitstreams?page=0&size=100').flush({
      _embedded: {
        bitstreams: [
          { uuid: 'p1', name: 'a.jpg', _links: { content: { href: '' } } },
          { uuid: 'p2', name: 'b.jpg', _links: { content: { href: '' } } },
        ],
      },
      page: { number: 0, size: 100, totalPages: 2, totalElements: 3 },
    });
    httpMock.expectOne('/server/api/core/bundles/bundle-original/bitstreams?page=1&size=100').flush({
      _embedded: {
        bitstreams: [{ uuid: 'p3', name: 'c.jpg', _links: { content: { href: '' } } }],
      },
      page: { number: 1, size: 100, totalPages: 2, totalElements: 3 },
    });

    await promise;
    expect(album?.photos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  /** Verifica que getAlbumById() devuelva undefined cuando falla el fetch. */
  it('should return undefined when item fetch fails', async () => {
    const promise = new Promise<void>((resolve, reject) => {
      service.getAlbumById('invalid-uuid').subscribe({
        next: (album) => {
          expect(album).toBeUndefined();
          resolve();
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/items/invalid-uuid');
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });

    await promise;
  });

  /** getFilterOptions — opciones de faceta para la galería */

  /**
   * Verifica que getFilterOptions() pueble cada filtro con el universo completo
   * de su faceta vía el endpoint dedicado, no con los facets capados del search.
   */
  it('should fetch filter options from the dedicated facets endpoint', async () => {
    const facetPage = (values: { label: string; count: number }[]) => ({
      page: { number: 0, size: 100 },
      _links: { self: { href: '' } },
      _embedded: { values },
    });

    const promise = new Promise((resolve, reject) => {
      service.getFilterOptions().subscribe({
        next: (options) => {
          expect(options.programs.length).toBe(2);
          expect(options.programs[0].label).toBe('PEAC');
          expect(options.programs[0].count).toBe(12);
          expect(options.eventTypes.length).toBe(2);
          expect(options.populationTypes.length).toBe(1);
          expect(options.imageContexts.length).toBe(1);
          resolve(options);
        },
        error: reject,
      });
    });

    httpMock.expectOne('/server/api/core/collections?page=0&size=100&embed=logo').flush(mockCollectionsResponse);

    httpMock
      .expectOne((req) =>
        req.url === '/server/api/discover/facets/classification' && req.params.get('scope') === 'col-galeria'
      )
      .flush(facetPage([{ label: 'PEAC', count: 12 }, { label: 'PRONEA', count: 5 }]));
    httpMock
      .expectOne((req) => req.url === '/server/api/discover/facets/itemtype')
      .flush(facetPage([{ label: 'graduacion', count: 8 }, { label: 'capacitacion', count: 4 }]));
    httpMock
      .expectOne((req) => req.url === '/server/api/discover/facets/populationType')
      .flush(facetPage([{ label: 'jovenes', count: 10 }]));
    httpMock
      .expectOne((req) => req.url === '/server/api/discover/facets/imageFocus')
      .flush(facetPage([{ label: 'interior', count: 7 }]));

    await promise;
  });

  /** Verifica que getFilterOptions() devuelva objeto vacío en caso de error. */
  it('should return empty options on error', async () => {
    const promise = new Promise((resolve, reject) => {
      service.getFilterOptions().subscribe({
        next: (options) => {
          expect(options.programs).toEqual([]);
          expect(options.eventTypes).toEqual([]);
          expect(options.populationTypes).toEqual([]);
          expect(options.imageContexts).toEqual([]);
          resolve(options);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?page=0&size=100&embed=logo');
    req.flush('Error', { status: 500, statusText: 'Server Error' });

    await promise;
  });

  /** getGalleryCollectionUuid$ — método público para que el container registre visitas */

  /** Verifica que getGalleryCollectionUuid$() resuelve el UUID de la colección Galeria desde el cache. */
  it('should expose getGalleryCollectionUuid$() that resolves the Galeria collection UUID via the cache', async () => {
    const promise = new Promise<string>((resolve, reject) => {
      service.getGalleryCollectionUuid$().subscribe({
        next: (uuid) => resolve(uuid),
        error: reject,
      });
    });

    httpMock.expectOne('/server/api/core/collections?page=0&size=100&embed=logo').flush(mockCollectionsResponse);

    const uuid = await promise;
    expect(uuid).toBe('col-galeria');
  });
});
