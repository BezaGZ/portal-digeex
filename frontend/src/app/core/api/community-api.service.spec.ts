import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CommunityApiService } from './community-api.service';

/**
 * Tests de `CommunityApiService`.
 *
 * Wrapper HTTP del recurso `/api/core/communities`. Verifica URLs correctas,
 * parámetros de paginación y proyección de subrecursos vía `embed`. Cubre
 * el listado top-level, la lectura por UUID y el listado de sub-comunidades
 * de una community padre.
 *
 * Ciclo 6 TDD — Sprint 6
 */
describe('CommunityApiService', () => {
  let service: CommunityApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CommunityApiService,
      ],
    });

    service = TestBed.inject(CommunityApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('list() debe pegar GET /api/core/communities con paginación por defecto (page=0, size=20)', async () => {
    const mockResponse = {
      _embedded: {
        communities: [
          {
            uuid: '123-456',
            name: 'DIGEEX',
            type: 'community',
            metadata: {
              'dc.title': [{ value: 'Dirección General de Educación Extraescolar' }],
            },
          },
        ],
      },
      _links: { self: { href: '/api/core/communities?page=0&size=20' } },
      page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
    };

    const promise = new Promise((resolve, reject) => {
      service.list().subscribe({
        next: (response) => {
          expect(response._embedded['communities'].length).toBe(1);
          expect(response._embedded['communities'][0].name).toBe('DIGEEX');
          expect(response.page.totalElements).toBe(1);
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  it('list() debe aceptar parámetros personalizados de paginación', async () => {
    const mockResponse = {
      _embedded: { communities: [] },
      _links: {},
      page: { size: 50, totalElements: 0, totalPages: 0, number: 2 },
    };

    const promise = new Promise((resolve, reject) => {
      service.list(2, 50).subscribe({
        next: (response) => {
          expect(response.page.number).toBe(2);
          expect(response.page.size).toBe(50);
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities?page=2&size=50');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  it('getOne() debe obtener una comunidad individual por UUID', async () => {
    const mockCommunity = {
      uuid: '123-456',
      name: 'DIGEEX',
      type: 'community',
      metadata: {
        'dc.title': [{ value: 'Dirección General de Educación Extraescolar' }],
        'dc.description': [{ value: 'Comunidad principal de DIGEEX' }],
      },
      _links: { self: { href: '/api/core/communities/123-456' } },
    };

    const promise = new Promise((resolve, reject) => {
      service.getOne('123-456').subscribe({
        next: (community) => {
          expect(community.uuid).toBe('123-456');
          expect(community.name).toBe('DIGEEX');
          expect(community.type).toBe('community');
          resolve(community);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities/123-456');
    expect(req.request.method).toBe('GET');
    req.flush(mockCommunity);

    await promise;
  });

  it('listSubcommunities() debe obtener las sub-comunidades de una community padre', async () => {
    const mockResponse = {
      _embedded: {
        subcommunities: [
          { uuid: 'sub-1', name: 'Subdirección Educación Básica', type: 'community' },
          { uuid: 'sub-2', name: 'Subdirección Trabajo y Cultura', type: 'community' },
          { uuid: 'sub-3', name: 'Subdirección Investigación', type: 'community' },
        ],
      },
      _links: {},
      page: { totalElements: 3 },
    };

    const promise = new Promise((resolve, reject) => {
      service.listSubcommunities('123-456').subscribe({
        next: (response) => {
          expect(response._embedded['subcommunities'].length).toBe(3);
          expect(response._embedded['subcommunities'][0].name).toBe(
            'Subdirección Educación Básica',
          );
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      '/server/api/core/communities/123-456/subcommunities?page=0&size=20',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });
});
