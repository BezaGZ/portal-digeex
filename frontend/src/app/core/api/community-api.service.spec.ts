import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CommunityApiService } from './community-api.service';
import { Community, CommunityCreateBody } from './models/community.model';
import { Group } from './models/group.model';
import communityCreateToplevelFixture from './test-fixtures/community-create-toplevel-response.json';
import communityCreateSubFixture from './test-fixtures/community-create-sub-response.json';
import communityPatchFixture from './test-fixtures/community-patch-response.json';
import communityCreateAdmingroupFixture from './test-fixtures/community-create-admingroup-response.json';
import { JsonPatchEntry } from './json-patch.util';

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

  it('list() should GET /api/core/communities with default pagination (page=0, size=20)', async () => {
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

  it('searchTop() should GET /api/core/communities/search/top with default pagination', async () => {
    const mockResponse = {
      _embedded: {
        communities: [
          { uuid: 'digeex-root', name: 'DIGEEX', type: 'community' },
        ],
      },
      _links: { self: { href: '/api/core/communities/search/top?page=0&size=20' } },
      page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
    };

    const promise = new Promise((resolve, reject) => {
      service.searchTop().subscribe({
        next: (response) => {
          expect(response._embedded['communities'].length).toBe(1);
          expect(response._embedded['communities'][0].uuid).toBe('digeex-root');
          resolve(response);
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne('/server/api/core/communities/search/top?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    await promise;
  });

  it('list() should accept custom pagination parameters', async () => {
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

  it('getOne() should fetch a single community by UUID', async () => {
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

  it('listSubcommunities() should fetch the sub-communities of a parent community', async () => {
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

  it('create() should POST to /api/core/communities (without parent) and return the created community', () => {
    const body: CommunityCreateBody = {
      name: 'Test Mutaciones Community Sprint 6',
      metadata: {
        'dc.title': [
          { value: 'Test Mutaciones Community Sprint 6', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      type: 'community',
    };
    let result: Community | undefined;

    service.create(body).subscribe((com) => (result = com));

    const req = httpMock.expectOne('/server/api/core/communities');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(communityCreateToplevelFixture);

    expect(result).toBeDefined();
    expect(result!.uuid).toBe('1522b3e8-7b77-4c11-986f-2b46d678219a');
    expect(result!.handle).toBe('123456789/122');
  });

  it('create() with parentUuid should POST with parent in query and return the created sub-community', () => {
    const body: CommunityCreateBody = {
      name: 'Test Sub Mutaciones Sprint 6',
      metadata: {
        'dc.title': [
          { value: 'Test Sub Mutaciones Sprint 6', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      type: 'community',
    };
    let result: Community | undefined;

    service.create(body, 'parent-uuid').subscribe((com) => (result = com));

    const req = httpMock.expectOne('/server/api/core/communities?parent=parent-uuid');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(communityCreateSubFixture);

    expect(result).toBeDefined();
    expect(result!.uuid).toBe('4fa9da73-69ca-4430-8b90-98eb643061cb');
    expect(result!.handle).toBe('123456789/123');
  });

  it('updateMetadata() should PATCH with JSON Patch body and return the updated community', () => {
    const patch: JsonPatchEntry[] = [
      {
        op: 'replace',
        path: '/metadata/dc.title/0/value',
        value: 'Test Sub Mutaciones Sprint 6 (modificada)',
      },
    ];
    let result: Community | undefined;

    service
      .updateMetadata('4fa9da73-69ca-4430-8b90-98eb643061cb', patch)
      .subscribe((com) => (result = com));

    const req = httpMock.expectOne(
      '/server/api/core/communities/4fa9da73-69ca-4430-8b90-98eb643061cb',
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(patch);
    req.flush(communityPatchFixture);

    expect(result).toBeDefined();
    expect(result!.metadata['dc.title'][0].value).toBe(
      'Test Sub Mutaciones Sprint 6 (modificada)',
    );
  });

  it('delete() should DELETE and complete the observable without emitting a value', () => {
    let nextEmitted = false;
    let completed = false;

    service.delete('4fa9da73-69ca-4430-8b90-98eb643061cb').subscribe({
      next: () => (nextEmitted = true),
      complete: () => (completed = true),
    });

    const req = httpMock.expectOne(
      '/server/api/core/communities/4fa9da73-69ca-4430-8b90-98eb643061cb',
    );
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(nextEmitted).toBe(true);
    expect(completed).toBe(true);
  });

  it('createAdminGroup() should POST to /communities/{uuid}/adminGroup with metadata body and return the auto-named Group', () => {
    const body = {
      metadata: {
        'dc.description': [
          {
            value: 'AdminGroup efímero auto-asociado vía POST',
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
      .createAdminGroup('9123e095-de73-4316-b319-1d2e60e9be83', body)
      .subscribe((g) => (result = g));

    const req = httpMock.expectOne(
      '/server/api/core/communities/9123e095-de73-4316-b319-1d2e60e9be83/adminGroup',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(communityCreateAdmingroupFixture);

    expect(result).toBeDefined();
    expect(result!.uuid).toBe('939d427e-9205-4b1f-85df-704d9bba2478');
    expect(result!.name).toBe('COMMUNITY_9123e095-de73-4316-b319-1d2e60e9be83_ADMIN');
    expect(result!.permanent).toBe(false);
  });
});
