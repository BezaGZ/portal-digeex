import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CollectionApiService } from './collection-api.service';
import { Collection, CollectionCreateBody } from './models/collection.model';
import { Group } from './models/group.model';
import { JsonPatchEntry } from './json-patch.util';
import collectionCreateFixture from './test-fixtures/collection-create-response.json';
import collectionPatchFixture from './test-fixtures/collection-patch-response.json';
import collectionCreateSubmittersgroupFixture from './test-fixtures/collection-create-submittersgroup-response.json';
import collectionCreateAdmingroupFixture from './test-fixtures/collection-create-admingroup-response.json';

/**
 * Tests de `CollectionApiService`.
 *
 * Wrapper HTTP del recurso `/api/core/collections`. Verifica URLs correctas,
 * parámetros de paginación y proyección de subrecursos vía `embed`. Cubre
 * el listado completo, el listado por community padre, la lectura por UUID,
 * la collection dueña de un item y el search nativo `findSubmitAuthorized`
 * (RestContract `collections.md`), base de la identidad por contrato del Sprint 11.
 *
 * Ciclo 6 TDD — Sprint 6. Ajustado en Ciclo 3 (Sprint 7), Ciclo 12 y Ciclo 13 (Sprint 8),
 * y Ciclos 1 y 3 (Sprint 11).
 */
describe('CollectionApiService', () => {
  let service: CollectionApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CollectionApiService,
      ],
    });

    service = TestBed.inject(CollectionApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('list() should fetch all collections in the repository (page=0, size=100)', async () => {
    const mockResponse = {
      _embedded: {
        collections: [
          { uuid: 'col-1', name: 'PEAC', type: 'collection' },
          { uuid: 'col-2', name: 'PRONEA', type: 'collection' },
        ],
      },
      _links: {},
      page: { totalElements: 2 },
    };

    const promise = new Promise((resolve, reject) => {
      service.list().subscribe({
        next: (response) => {
          expect(response._embedded['collections'].length).toBe(2);
          expect(response._embedded['collections'][0].name).toBe('PEAC');
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections?page=0&size=100');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /** Proyección embed */

  /** Verifica que list() concatene el query param `embed` cuando viene en options. */
  it('list() should append embed when provided in options', async () => {
    const promise = new Promise((resolve, reject) => {
      service.list(0, 100, { embed: 'logo' }).subscribe({
        next: (r) => resolve(r),
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/collections?page=0&size=100&embed=logo',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ _embedded: { collections: [] }, _links: {}, page: { totalElements: 0 } });

    await promise;
  });

  /** Verifica que listByCommunity() concatene `embed` igual que list(). */
  it('listByCommunity() should append embed when provided in options', async () => {
    const promise = new Promise((resolve, reject) => {
      service.listByCommunity('123-456', 0, 20, { embed: 'logo' }).subscribe({
        next: (r) => resolve(r),
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/communities/123-456/collections?page=0&size=20&embed=logo',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ _embedded: { collections: [] }, _links: {}, page: { totalElements: 0 } });

    await promise;
  });

  it('listByCommunity() should fetch the collections of a specific community', async () => {
    const mockResponse = {
      _embedded: {
        collections: [
          { uuid: 'col-1', name: 'PEAC', type: 'collection' },
          { uuid: 'col-2', name: 'PRONEA', type: 'collection' },
        ],
      },
      _links: {},
      page: { totalElements: 2 },
    };

    const promise = new Promise((resolve, reject) => {
      service.listByCommunity('123-456').subscribe({
        next: (response) => {
          expect(response._embedded['collections'].length).toBe(2);
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/communities/123-456/collections?page=0&size=20',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /**
   * Verifica que `listAll` no imponga `size` al backend y resuelva en una
   * sola request cuando `totalPages=1`. Camino feliz del widget Top colecciones
   * cuando el repo cabe en la primera página default de DSpace.
   */
  it('listAll() should hit /collections without size param and resolve in one request', async () => {
    const promise = new Promise<Collection[]>((resolve, reject) => {
      service.listAll().subscribe({
        next: (colls) => {
          expect(colls.map((c) => c.uuid)).toEqual(['col-1', 'col-2']);
          resolve(colls);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections');
    expect(req.request.method).toBe('GET');
    req.flush({
      _embedded: {
        collections: [
          { uuid: 'col-1', name: 'A', type: 'collection', archivedItemsCount: 1, handle: '1/1', metadata: {}, _links: { self: { href: '' } } },
          { uuid: 'col-2', name: 'B', type: 'collection', archivedItemsCount: 2, handle: '1/2', metadata: {}, _links: { self: { href: '' } } },
        ],
      },
      _links: { self: { href: '/' } },
      page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
    });

    await promise;
  });

  /**
   * Verifica que `listAll` pagine recursivamente hasta agotar `totalPages`,
   * pasando solo `page` desde la segunda página en adelante. El tamaño lo
   * impone el backend.
   */
  it('listAll() should paginate recursively when totalPages > 1, concatenating all pages', async () => {
    const promise = new Promise<Collection[]>((resolve, reject) => {
      service.listAll().subscribe({
        next: (colls) => {
          expect(colls.map((c) => c.uuid)).toEqual(['col-1', 'col-2', 'col-3']);
          resolve(colls);
        },
        error: reject,
      });
    });

    const r0 = httpMock.expectOne('/server/api/core/collections');
    r0.flush({
      _embedded: {
        collections: [
          { uuid: 'col-1', name: 'A', type: 'collection', archivedItemsCount: 0, handle: '', metadata: {}, _links: { self: { href: '' } } },
        ],
      },
      _links: { self: { href: '/' } },
      page: { size: 20, totalElements: 3, totalPages: 3, number: 0 },
    });

    const r1 = httpMock.expectOne('/server/api/core/collections?page=1');
    r1.flush({
      _embedded: {
        collections: [
          { uuid: 'col-2', name: 'B', type: 'collection', archivedItemsCount: 0, handle: '', metadata: {}, _links: { self: { href: '' } } },
        ],
      },
      _links: { self: { href: '/' } },
      page: { size: 20, totalElements: 3, totalPages: 3, number: 1 },
    });

    const r2 = httpMock.expectOne('/server/api/core/collections?page=2');
    r2.flush({
      _embedded: {
        collections: [
          { uuid: 'col-3', name: 'C', type: 'collection', archivedItemsCount: 0, handle: '', metadata: {}, _links: { self: { href: '' } } },
        ],
      },
      _links: { self: { href: '/' } },
      page: { size: 20, totalElements: 3, totalPages: 3, number: 2 },
    });

    await promise;
  });

  /** Verifica que `listAllByCommunity` agote páginas para una community específica. */
  it('listAllByCommunity() should paginate recursively scoped to a single community', async () => {
    const promise = new Promise<Collection[]>((resolve, reject) => {
      service.listAllByCommunity('sub-1').subscribe({
        next: (colls) => {
          expect(colls.map((c) => c.uuid)).toEqual(['col-a', 'col-b']);
          resolve(colls);
        },
        error: reject,
      });
    });

    const r0 = httpMock.expectOne('/server/api/core/communities/sub-1/collections');
    r0.flush({
      _embedded: {
        collections: [
          { uuid: 'col-a', name: 'A', type: 'collection', archivedItemsCount: 0, handle: '', metadata: {}, _links: { self: { href: '' } } },
        ],
      },
      _links: { self: { href: '/' } },
      page: { size: 20, totalElements: 2, totalPages: 2, number: 0 },
    });

    const r1 = httpMock.expectOne('/server/api/core/communities/sub-1/collections?page=1');
    r1.flush({
      _embedded: {
        collections: [
          { uuid: 'col-b', name: 'B', type: 'collection', archivedItemsCount: 0, handle: '', metadata: {}, _links: { self: { href: '' } } },
        ],
      },
      _links: { self: { href: '/' } },
      page: { size: 20, totalElements: 2, totalPages: 2, number: 1 },
    });

    await promise;
  });

  it('getOne() should fetch a single collection by UUID', async () => {
    const mockCollection = {
      uuid: 'col-123',
      name: 'PEAC',
      type: 'collection',
      metadata: { 'dc.title': [{ value: 'Programa PEAC' }] },
      _links: { self: { href: '/api/core/collections/col-123' } },
    };

    const promise = new Promise((resolve, reject) => {
      service.getOne('col-123').subscribe({
        next: (collection) => {
          expect(collection.uuid).toBe('col-123');
          expect(collection.name).toBe('PEAC');
          resolve(collection);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections/col-123');
    expect(req.request.method).toBe('GET');
    req.flush(mockCollection);

    await promise;
  });

  it('getOwningCollectionOfItem() should return the owning collection of an item', async () => {
    const mockCollection = {
      uuid: 'col-123',
      name: 'PEAC',
      type: 'collection',
    };

    const promise = new Promise((resolve, reject) => {
      service.getOwningCollectionOfItem('item-456').subscribe({
        next: (collection) => {
          expect(collection.uuid).toBe('col-123');
          resolve(collection);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/items/item-456/owningCollection');
    expect(req.request.method).toBe('GET');
    req.flush(mockCollection);

    await promise;
  });

  it('create() should POST to /api/core/collections with parent in query and return the created collection', () => {
    const body: CollectionCreateBody = {
      name: 'Test Mutaciones Sprint 6',
      metadata: {
        'dc.title': [
          { value: 'Test Mutaciones Sprint 6', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      type: 'collection',
    };
    let result: Collection | undefined;

    service.create('parent-uuid', body).subscribe((col) => (result = col));

    const req = httpMock.expectOne(
      '/server/api/core/collections?parent=parent-uuid',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(collectionCreateFixture);

    expect(result).toBeDefined();
    expect(result!.uuid).toBe('0ee8f1ab-cd87-49ef-977c-c801ec508a7c');
    expect(result!.name).toBe('Test Mutaciones Sprint 6');
    expect(result!.handle).toBe('123456789/121');
  });

  it('updateMetadata() should PATCH with JSON Patch body and return the updated collection', () => {
    const patch: JsonPatchEntry[] = [
      {
        op: 'replace',
        path: '/metadata/dc.title/0/value',
        value: 'Test Mutaciones Sprint 6 (modificada)',
      },
    ];
    let result: Collection | undefined;

    service
      .updateMetadata('0ee8f1ab-cd87-49ef-977c-c801ec508a7c', patch)
      .subscribe((col) => (result = col));

    const req = httpMock.expectOne(
      '/server/api/core/collections/0ee8f1ab-cd87-49ef-977c-c801ec508a7c',
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(patch);
    req.flush(collectionPatchFixture);

    expect(result).toBeDefined();
    expect(result!.metadata['dc.title'][0].value).toBe(
      'Test Mutaciones Sprint 6 (modificada)',
    );
  });

  it('delete() should DELETE and complete the observable without emitting a value', () => {
    let nextEmitted = false;
    let completed = false;

    service.delete('0ee8f1ab-cd87-49ef-977c-c801ec508a7c').subscribe({
      next: () => (nextEmitted = true),
      complete: () => (completed = true),
    });

    const req = httpMock.expectOne(
      '/server/api/core/collections/0ee8f1ab-cd87-49ef-977c-c801ec508a7c',
    );
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(nextEmitted).toBe(true);
    expect(completed).toBe(true);
  });

  it('createSubmittersGroup() should POST to /collections/{uuid}/submittersGroup with metadata body and return the auto-named Group', () => {
    const body = {
      metadata: {
        'dc.description': [
          {
            value: 'SubmittersGroup efímero auto-asociado vía POST',
            language: null,
            authority: null,
            confidence: -1,
            place: 0,
          },
        ],
      },
    };
    let result: Group | undefined;

    service
      .createSubmittersGroup('8d55e068-4354-4620-9f80-faf4dbe933c1', body)
      .subscribe((g) => (result = g));

    const req = httpMock.expectOne(
      '/server/api/core/collections/8d55e068-4354-4620-9f80-faf4dbe933c1/submittersGroup',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(collectionCreateSubmittersgroupFixture);

    expect(result).toBeDefined();
    expect(result!.uuid).toBe('309d5464-6e12-49bc-b1d8-b927b79e701b');
    expect(result!.name).toBe('COLLECTION_8d55e068-4354-4620-9f80-faf4dbe933c1_SUBMIT');
    expect(result!.permanent).toBe(false);
  });

  /**
   * Ciclo 40.3 — sub-tarea del Ciclo 40 grande. Replica del submittersGroup
   * sobre el endpoint adminGroup. DSpace auto-nombra el grupo resultante
   * `COLLECTION_<uuid>_admin` y `CollectionFacade.createColeccion$` lo va a
   * enlazar al `SUBMITTERS_<sufijo>` compartido como subgroup, igual que con
   * el submittersGroup, para que los delegados hereden ADMIN sobre la coll
   * recién creada y puedan subir cover post-archive.
   */
  /** Logo subrecurso */

  /** Verifica que getLogo() devuelva el bitstream cuando DSpace responde 200. */
  it('getLogo() should GET /collections/{uuid}/logo and return the Bitstream when present', async () => {
    const mockBitstream = {
      uuid: 'logo-bs-1',
      name: 'logo.png',
      handle: null,
      metadata: {},
      sizeBytes: 1024,
      checkSum: { checkSumAlgorithm: 'MD5', value: 'abc' },
      sequenceId: 1,
      type: 'bitstream',
    };

    const promise = new Promise((resolve, reject) => {
      service.getLogo('coll-with-logo').subscribe({
        next: (bs) => {
          expect(bs).not.toBeNull();
          expect(bs!.uuid).toBe('logo-bs-1');
          resolve(bs);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections/coll-with-logo/logo');
    expect(req.request.method).toBe('GET');
    req.flush(mockBitstream);

    await promise;
  });

  /**
   * Verifica que getLogo() mapee a null cuando DSpace responde 204.
   * "Sin logo" es un estado válido del recurso; el wrapper lo expone sin error.
   */
  it('getLogo() should resolve with null when DSpace responds 204 No Content', async () => {
    const promise = new Promise((resolve, reject) => {
      service.getLogo('coll-without-logo').subscribe({
        next: (bs) => {
          expect(bs).toBeNull();
          resolve(bs);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections/coll-without-logo/logo');
    expect(req.request.method).toBe('GET');
    req.flush(null, { status: 204, statusText: 'No Content' });

    await promise;
  });

  /**
   * Verifica que uploadLogo() haga POST multipart con el archivo en `file`.
   * HttpClient arma el boundary cuando recibe FormData; el wrapper no toca Content-Type.
   */
  it('uploadLogo() should POST multipart to /collections/{uuid}/logo and return the created Bitstream', async () => {
    const file = new File(['fake-png-content'], 'logo.png', { type: 'image/png' });
    const mockBitstream = {
      uuid: 'logo-bs-new',
      name: 'logo.png',
      handle: null,
      metadata: {},
      sizeBytes: 16,
      checkSum: { checkSumAlgorithm: 'MD5', value: 'def' },
      sequenceId: 1,
      type: 'bitstream',
    };

    const promise = new Promise((resolve, reject) => {
      service.uploadLogo('coll-1', file).subscribe({
        next: (bs) => {
          expect(bs.uuid).toBe('logo-bs-new');
          resolve(bs);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/collections/coll-1/logo');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush(mockBitstream, { status: 201, statusText: 'Created' });

    await promise;
  });

  it('createAdminGroup() should POST to /collections/{uuid}/adminGroup with metadata body and return the auto-named Group', () => {
    const body = {
      metadata: {
        'dc.description': [
          {
            value: 'AdminGroup técnico auto-asociado vía POST',
            language: null,
            authority: null,
            confidence: -1,
            place: 0,
          },
        ],
      },
    };
    let result: Group | undefined;

    service
      .createAdminGroup('8d55e068-4354-4620-9f80-faf4dbe933c1', body)
      .subscribe((g) => (result = g));

    const req = httpMock.expectOne(
      '/server/api/core/collections/8d55e068-4354-4620-9f80-faf4dbe933c1/adminGroup',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(collectionCreateAdmingroupFixture);

    expect(result).toBeDefined();
    expect(result!.uuid).toBe('4f1a2c8b-3d72-4ab9-9e1c-7f4d2c1e8b3a');
    expect(result!.name).toBe('COLLECTION_8d55e068-4354-4620-9f80-faf4dbe933c1_admin');
    expect(result!.permanent).toBe(false);
  });

  /** Búsquedas autorizadas */

  /** Verifica que searchSubmitAuthorized() pegue al search nativo con la paginación default. */
  it('searchSubmitAuthorized() should GET /api/core/collections/search/findSubmitAuthorized with default pagination', async () => {
    const mockResponse = {
      _embedded: {
        collections: [
          {
            uuid: 'b21a5904-8f7c-4bcc-bcba-ab4a6df69304',
            name: 'Investigaciones Educativas',
            type: 'collection',
          },
          {
            uuid: 'fc7a614f-a964-4288-8561-558a2a4edae8',
            name: 'Galería Institucional',
            type: 'collection',
          },
        ],
      },
      _links: { self: { href: '/api/core/collections/search/findSubmitAuthorized?page=0&size=20' } },
      page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
    };

    const promise = new Promise((resolve, reject) => {
      service.searchSubmitAuthorized().subscribe({
        next: (response) => {
          expect(response._embedded['collections'].length).toBe(2);
          expect(response._embedded['collections'][0].uuid).toBe(
            'b21a5904-8f7c-4bcc-bcba-ab4a6df69304',
          );
          expect(response.page.totalElements).toBe(2);
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/collections/search/findSubmitAuthorized?page=0&size=20',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /** Verifica que searchSubmitAuthorized() propague page y size custom al backend. */
  it('searchSubmitAuthorized() should accept custom pagination parameters', async () => {
    const mockResponse = {
      _embedded: { collections: [] },
      _links: {},
      page: { size: 50, totalElements: 0, totalPages: 0, number: 1 },
    };

    const promise = new Promise((resolve, reject) => {
      service.searchSubmitAuthorized(1, 50).subscribe({
        next: (response) => {
          expect(response.page.number).toBe(1);
          expect(response.page.size).toBe(50);
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/collections/search/findSubmitAuthorized?page=1&size=50',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  /** Verifica que getParentCommunity() pegue al subrecurso nativo y parsee la comunidad. */
  it('getParentCommunity() should GET /api/core/collections/{uuid}/parentCommunity and return the community', async () => {
    const mockCommunity = {
      uuid: '08b572b5-5c47-4005-ad3a-a0f563ce639f',
      name: 'Subdirección de Formación, Investigación y Proyectos Educativos',
      type: 'community',
    };

    const promise = new Promise((resolve, reject) => {
      service.getParentCommunity('b21a5904-8f7c-4bcc-bcba-ab4a6df69304').subscribe({
        next: (community) => {
          expect(community?.uuid).toBe('08b572b5-5c47-4005-ad3a-a0f563ce639f');
          resolve(community);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/collections/b21a5904-8f7c-4bcc-bcba-ab4a6df69304/parentCommunity',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockCommunity);

    await promise;
  });

  /**
   * Verifica que el 204 del contrato (colección sin padre) resuelva null.
   * DSpace responde 204 sin body; el wrapper lo expone como null tipado.
   */
  it('getParentCommunity() should resolve to null when the backend answers 204 (no parent)', async () => {
    const promise = new Promise((resolve, reject) => {
      service.getParentCommunity('orphan-collection').subscribe({
        next: (community) => {
          expect(community).toBeNull();
          resolve(community);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/collections/orphan-collection/parentCommunity',
    );
    req.flush(null, { status: 204, statusText: 'No Content' });

    await promise;
  });
});
