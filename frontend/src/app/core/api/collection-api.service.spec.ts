import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CollectionApiService } from './collection-api.service';

/**
 * Tests de `CollectionApiService`.
 *
 * Wrapper HTTP del recurso `/api/core/collections`. Verifica URLs correctas,
 * parámetros de paginación y proyección de subrecursos vía `embed`. Cubre
 * el listado completo, el listado por community padre, la lectura por UUID
 * y la collection dueña de un item.
 *
 * Ciclo 6 TDD — Sprint 6
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

  it('list() debe obtener todas las colecciones del repositorio (page=0, size=100)', async () => {
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

  it('listByCommunity() debe obtener las colecciones de una comunidad específica', async () => {
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

  it('getOne() debe obtener una colección individual por UUID', async () => {
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

  it('getOwningCollectionOfItem() debe devolver la colección dueña de un item', async () => {
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
});
