import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CollectionCacheService } from './collection-cache.service';
import { CollectionApiService } from './collection-api.service';
import { NAV_LOCATION, ENTITY_TYPE } from '../config/digeex-values.config';

/**
 * Tests para CollectionCacheService.
 *
 * Caché centralizado de colecciones del repositorio.
 * Verifica que se haga una única petición HTTP compartida entre
 * los tres consumidores (Home, PublicHeader, GalleryService),
 * el filtrado por digeex.navLocation, la búsqueda por dspace.entity.type y la
 * invalidación del caché.
 *
 * Ciclo 7 TDD - Sprint 4 TDD. Ajustado en Ciclo 5 y Ciclo 8 (Sprint 9).
 */
describe('CollectionCacheService', () => {
  let service: CollectionCacheService;
  let httpMock: HttpTestingController;

  /** Setup */

  const mockCollectionsResponse = {
    _embedded: {
      collections: [
        {
          uuid: 'col-menu-1',
          name: 'Inicio',
          type: 'collection',
          metadata: {
            'digeex.navLocation': [{ value: NAV_LOCATION.MENU_PRINCIPAL }],
            'dc.identifier.other': [{ value: '1' }],
          },
        },
        {
          uuid: 'col-menu-2',
          name: 'Acerca de',
          type: 'collection',
          metadata: {
            'digeex.navLocation': [{ value: NAV_LOCATION.MENU_SECUNDARIO }],
            'dc.identifier.other': [{ value: '2' }],
          },
        },
        {
          uuid: 'col-menu-3',
          name: 'Contacto',
          type: 'collection',
          metadata: {
            'digeex.navLocation': [{ value: NAV_LOCATION.MENU_SECUNDARIO }],
            'dc.identifier.other': [{ value: '1' }],
          },
        },
        {
          uuid: 'col-galeria',
          name: 'Galería Institucional',
          type: 'collection',
          metadata: {
            'dspace.entity.type': [{ value: ENTITY_TYPE.GALERIA }],
          },
        },
        {
          uuid: 'col-estadistica',
          name: 'Estadísticas DIGEEX',
          type: 'collection',
          metadata: {
            'dspace.entity.type': [{ value: ENTITY_TYPE.ESTADISTICA }],
          },
        },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 5, totalPages: 1, number: 0 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CollectionApiService,
        CollectionCacheService,
      ],
    });

    service = TestBed.inject(CollectionCacheService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** menuReady — splash de primera carga */

  /** Verifica que menuReady arranque en false y pase a true cuando la primera carga resuelve. */
  it('should flip menuReady to true after the first load resolves', async () => {
    expect(service.menuReady()).toBe(false);

    const promise = new Promise((resolve, reject) => {
      service.getAll().subscribe({ next: resolve, error: reject });
    });
    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush(mockCollectionsResponse);
    await promise;

    expect(service.menuReady()).toBe(true);
  });

  /**
   * Verifica que un error HTTP también encienda menuReady.
   * Si DSpace está caído, el portal debe aparecer con menús vacíos en
   * lugar de quedarse encerrado en el splash de carga.
   */
  it('should flip menuReady to true when the first load fails', async () => {
    const promise = new Promise((resolve) => {
      service.getAll().subscribe({ next: resolve, error: resolve });
    });
    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    await promise;

    expect(service.menuReady()).toBe(true);
  });

  /** getAll — caché y deduplicación */

  /** Verifica que getAll() haga UNA sola petición HTTP la primera vez. */
  it('should fetch all collections on first call', async () => {
    const promise = new Promise((resolve, reject) => {
      service.getAll().subscribe({
        next: (collections) => {
          expect(collections.length).toBe(5);
          expect(collections[0].name).toBe('Inicio');
          resolve(collections);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    expect(req.request.method).toBe('GET');
    req.flush(mockCollectionsResponse);

    await promise;
  });

  /** Verifica que la segunda llamada a getAll() no haga otra petición HTTP. */
  it('should not make a second HTTP request when cache is populated', async () => {
    const firstCall = new Promise((resolve, reject) => {
      service.getAll().subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush(mockCollectionsResponse);
    await firstCall;

    const secondCall = new Promise((resolve, reject) => {
      service.getAll().subscribe({
        next: (collections) => {
          expect(collections.length).toBe(5);
          resolve(collections);
        },
        error: reject,
      });
    });

    await secondCall;
  });

  /** Verifica que dos llamadas simultáneas compartan la misma petición (shareReplay). */
  it('should share a single HTTP request between simultaneous callers', async () => {
    const firstCaller = new Promise((resolve, reject) => {
      service.getAll().subscribe({ next: resolve, error: reject });
    });

    const secondCaller = new Promise((resolve, reject) => {
      service.getAll().subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush(mockCollectionsResponse);

    const [first, second] = await Promise.all([firstCaller, secondCaller]);
    expect((first as unknown[]).length).toBe(5);
    expect((second as unknown[]).length).toBe(5);
  });

  /** getByMenuType — filtrado por digeex.navLocation */

  /** Verifica que getByMenuType() filtre por digeex.navLocation y ordene por dc.identifier.other. */
  it('should filter collections by menuType and sort by order field', async () => {
    const promise = new Promise((resolve, reject) => {
      service.getByMenuType(NAV_LOCATION.MENU_SECUNDARIO).subscribe({
        next: (collections) => {
          expect(collections.length).toBe(2);
          expect(collections[0].name).toBe('Contacto');
          expect(collections[1].name).toBe('Acerca de');
          resolve(collections);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush(mockCollectionsResponse);

    await promise;
  });

  /** Verifica que getByMenuType() devuelva arreglo vacío si no hay coincidencias. */
  it('should return empty array when no collections match menuType', async () => {
    const promise = new Promise((resolve, reject) => {
      service.getByMenuType('menu-inexistente').subscribe({
        next: (collections) => {
          expect(collections.length).toBe(0);
          resolve(collections);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush(mockCollectionsResponse);

    await promise;
  });

  /** findByFormat — búsqueda por dspace.entity.type */

  /** Verifica que findByFormat('galeria') devuelva el UUID correcto. */
  it('should find collection UUID by format', async () => {
    const promise = new Promise((resolve, reject) => {
      service.findByFormat(ENTITY_TYPE.GALERIA).subscribe({
        next: (uuid) => {
          expect(uuid).toBe('col-galeria');
          resolve(uuid);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush(mockCollectionsResponse);

    await promise;
  });

  /** Verifica que findByFormat() lance error si no encuentra coincidencia. */
  it('should throw error when no collection matches format', async () => {
    const promise = new Promise<void>((resolve, reject) => {
      service.findByFormat('formato-inexistente').subscribe({
        next: () => reject(new Error('Should have thrown error')),
        error: (err: Error) => {
          expect(err.message).toContain('formato-inexistente');
          resolve();
        },
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req.flush(mockCollectionsResponse);

    await promise;
  });

  /** invalidate — reinicio del caché */

  /** Verifica que invalidate() fuerce una nueva petición HTTP. */
  it('should refetch collections after invalidate()', async () => {
    const firstCall = new Promise((resolve, reject) => {
      service.getAll().subscribe({ next: resolve, error: reject });
    });

    const req1 = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req1.flush(mockCollectionsResponse);
    await firstCall;

    service.invalidate();

    const secondCall = new Promise((resolve, reject) => {
      service.getAll().subscribe({
        next: (collections) => {
          expect(collections.length).toBe(5);
          resolve(collections);
        },
        error: reject,
      });
    });

    const req2 = httpMock.expectOne('/server/api/core/collections?embed=logo');
    req2.flush(mockCollectionsResponse);

    await secondCall;
  });
});
