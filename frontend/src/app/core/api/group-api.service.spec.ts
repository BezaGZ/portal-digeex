import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GroupApiService } from './group-api.service';
import { Group, GroupCreateBody } from './models/group.model';
import { JsonPatchEntry } from './json-patch.util';
import groupCreateFixture from './test-fixtures/group-create-response.json';
import groupSearchByMetadataFixture from './test-fixtures/group-search-by-metadata-response.json';
import groupPatchFixture from './test-fixtures/group-patch-response.json';

/**
 * Tests de GroupApiService, wrapper HTTP del recurso /api/eperson/groups
 * y del subrecurso /api/eperson/epersons/{uuid}/groups de DSpace 9.2.
 *
 * Verifica getGroupsOfEPerson() para leer la pertenencia de un usuario
 * a grupos, y addMemberToGroup() / removeMemberFromGroup() para asignar
 * y revocar membresía.
 *
 * Ciclo 8 TDD — Sprint 5.
 */
describe('GroupApiService', () => {
  let service: GroupApiService;
  let httpMock: HttpTestingController;

  const mockGroupsResponse = {
    _embedded: {
      groups: [
        {
          uuid: 'group-admin-educacion-basica',
          name: 'COMMUNITY_educacion_basica_ADMIN',
          permanent: false,
          type: 'group',
          _links: {
            self: { href: '/server/api/eperson/groups/group-admin-educacion-basica' },
            object: { href: '/server/api/core/communities/community-educacion-basica' },
            epersons: { href: '/server/api/eperson/groups/group-admin-educacion-basica/epersons' },
            subgroups: { href: '/server/api/eperson/groups/group-admin-educacion-basica/subgroups' },
          },
        },
        {
          uuid: 'group-administrator',
          name: 'Administrator',
          permanent: true,
          type: 'group',
          _links: {
            self: { href: '/server/api/eperson/groups/group-administrator' },
            object: { href: '' },
            epersons: { href: '/server/api/eperson/groups/group-administrator/epersons' },
            subgroups: { href: '/server/api/eperson/groups/group-administrator/subgroups' },
          },
        },
      ],
    },
    page: {
      size: 20,
      totalElements: 2,
      totalPages: 1,
      number: 0,
    },
    _links: {
      self: { href: '/server/api/eperson/epersons/eperson-uuid-001/groups' },
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GroupApiService,
      ],
    });

    service = TestBed.inject(GroupApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Verifica que el servicio se instancie correctamente
   * a través del sistema de inyección de dependencias.
   */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * getGroupsOfEPerson(): GET /api/eperson/epersons/{uuid}/groups.
   * Es el endpoint que expone el subrecurso "groups" declarado con
   * @LinkRest en EPersonRest.java. Devuelve los grupos a los que
   * pertenece el eperson, incluidos los heredados por subgrupos.
   */
  describe('getGroupsOfEPerson()', () => {
    /**
     * Verifica que el GET apunte al subrecurso groups del eperson
     * indicado por uuid, con los parámetros de paginación.
     */
    it('should GET /api/eperson/epersons/{uuid}/groups with size and page params', async () => {
      const promise = new Promise((resolve, reject) => {
        service.getGroupsOfEPerson('eperson-uuid-001', { size: 20, page: 0 }).subscribe({
          next: resolve,
          error: reject,
        });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/eperson-uuid-001/groups' &&
          r.params.get('size') === '20' &&
          r.params.get('page') === '0',
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockGroupsResponse);

      await promise;
    });

    /**
     * Verifica que la respuesta se aplane a Paginated<Group> y que los
     * _links de cada grupo se preserven intactos, porque el facade los
     * necesita para resolver el DSO dueño (object) y los miembros.
     */
    it('should return paginated groups preserving HAL _links', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.getGroupsOfEPerson('eperson-uuid-001', { size: 20, page: 0 }).subscribe({
          next: (result) => {
            expect(result.items.length).toBe(2);
            expect(result.items[0].uuid).toBe('group-admin-educacion-basica');
            expect(result.items[0].name).toBe('COMMUNITY_educacion_basica_ADMIN');
            expect(result.items[0].permanent).toBe(false);
            expect(result.items[0]._links.object.href).toBe(
              '/server/api/core/communities/community-educacion-basica',
            );
            expect(result.items[1].uuid).toBe('group-administrator');
            expect(result.items[1].permanent).toBe(true);
            expect(result.items[1]._links.object.href).toBe('');
            expect(result.totalElements).toBe(2);
            expect(result.totalPages).toBe(1);
            expect(result.size).toBe(20);
            expect(result.page).toBe(0);
            resolve();
          },
          error: reject,
        });
      });

      const req = httpMock.expectOne(
        (r) => r.url === '/server/api/eperson/epersons/eperson-uuid-001/groups',
      );
      req.flush(mockGroupsResponse);

      await promise;
    });

    /**
     * Verifica que un error HTTP se propague como error del Observable
     * y no se silencie ni se devuelva un valor válido.
     */
    it('should propagate HTTP errors as Observable error', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.getGroupsOfEPerson('eperson-uuid-001', { size: 20, page: 0 }).subscribe({
          next: () => reject(new Error('El observable no debería emitir valor ante un 500')),
          error: (err) => {
            expect(err.status).toBe(500);
            resolve();
          },
        });
      });

      const req = httpMock.expectOne(
        (r) => r.url === '/server/api/eperson/epersons/eperson-uuid-001/groups',
      );
      req.flush(
        { message: 'Internal Server Error' },
        { status: 500, statusText: 'Internal Server Error' },
      );

      await promise;
    });
  });

  /**
   * addMemberToGroup(): POST /api/eperson/groups/{groupUuid}/epersons con
   * Content-Type text/uri-list. El body es la URL absoluta del eperson
   * al que se le asigna el grupo, según el contrato REST de DSpace 9.2.
   */
  describe('addMemberToGroup()', () => {
    /**
     * Verifica que la llamada apunte al subrecurso /epersons del grupo,
     * use POST, y que el body sea la URL absoluta del eperson con el
     * Content-Type text/uri-list que exige DSpace.
     */
    it('should POST text/uri-list with absolute eperson URL to add member', async () => {
      const promise = new Promise((resolve, reject) => {
        service
          .addMemberToGroup('group-admin-educacion-basica', 'eperson-uuid-001')
          .subscribe({ next: resolve, error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/groups/group-admin-educacion-basica/epersons' &&
          r.method === 'POST',
      );
      expect(req.request.headers.get('Content-Type')).toBe('text/uri-list');
      expect(req.request.body).toBe(
        `${window.location.origin}/server/api/eperson/epersons/eperson-uuid-001`,
      );
      req.flush({});

      await promise;
    });

    /**
     * Verifica que un error HTTP al asignar membresía se propague como
     * error del Observable para que el facade pueda traducirlo a un
     * mensaje para el admin.
     */
    it('should propagate HTTP errors as Observable error', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service
          .addMemberToGroup('group-admin-educacion-basica', 'eperson-uuid-001')
          .subscribe({
            next: () => reject(new Error('No debería emitir valor ante un 403')),
            error: (err) => {
              expect(err.status).toBe(403);
              resolve();
            },
          });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/groups/group-admin-educacion-basica/epersons',
      );
      req.flush(
        { message: 'Forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );

      await promise;
    });
  });

  /**
   * removeMemberFromGroup(): DELETE /api/eperson/groups/{groupUuid}/epersons/{epersonUuid}.
   * DSpace responde 204 No Content cuando el miembro se retira con éxito.
   */
  describe('removeMemberFromGroup()', () => {
    /**
     * Verifica que el DELETE apunte al recurso concreto del miembro
     * dentro del grupo, para retirar su membresía sin afectar a otros.
     */
    it('should DELETE /api/eperson/groups/{groupUuid}/epersons/{epersonUuid}', async () => {
      const promise = new Promise((resolve, reject) => {
        service
          .removeMemberFromGroup('group-admin-educacion-basica', 'eperson-uuid-001')
          .subscribe({ next: resolve, error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url ===
            '/server/api/eperson/groups/group-admin-educacion-basica/epersons/eperson-uuid-001' &&
          r.method === 'DELETE',
      );
      req.flush(null, { status: 204, statusText: 'No Content' });

      await promise;
    });

    /**
     * Verifica que un error HTTP al retirar membresía se propague como
     * error del Observable, tanto para 403 como para otros casos que
     * el facade pueda querer manejar distinto (ej. miembro no existe).
     */
    it('should propagate HTTP errors as Observable error', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service
          .removeMemberFromGroup('group-admin-educacion-basica', 'eperson-uuid-001')
          .subscribe({
            next: () => reject(new Error('No debería emitir valor ante un 403')),
            error: (err) => {
              expect(err.status).toBe(403);
              resolve();
            },
          });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url ===
          '/server/api/eperson/groups/group-admin-educacion-basica/epersons/eperson-uuid-001',
      );
      req.flush(
        { message: 'Forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );

      await promise;
    });
  });

  /**
   * create(): POST /api/eperson/groups con body {name, metadata?}. Único
   * endpoint del contrato 9.x donde se puede fijar el nombre del grupo
   * directamente. Lo usa el CommunityFacade del Bloque 1 para crear los
   * grupos intermedios SUBMITTERS_<sufijo> al alta de subcomunidad.
   */
  describe('create()', () => {
    it('should POST to /api/eperson/groups with body and return the created Group', () => {
      const body: GroupCreateBody = {
        name: 'TEST_CICLO_9',
        metadata: {
          'dc.description': [
            {
              value: 'Grupo efímero creado por capture-group-mutations.sh para anclar create()',
              language: null,
              authority: null,
              confidence: -1,
              place: 0,
            },
          ],
        },
      };
      let result: Group | undefined;

      service.create(body).subscribe((g) => (result = g));

      const req = httpMock.expectOne('/server/api/eperson/groups');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush(groupCreateFixture);

      expect(result).toBeDefined();
      expect(result!.uuid).toBe('10b48251-2bd3-4dee-9f42-1d6f300af838');
      expect(result!.name).toBe('TEST_CICLO_9');
      expect(result!.permanent).toBe(false);
    });
  });

  /**
   * getByName(): GET /api/eperson/groups/search/byMetadata?query=<name>
   * + filtro exacto en código. byMetadata hace LIKE sobre nombre y UUID,
   * por lo que puede devolver substring matches; el wrapper se queda solo
   * con el `name` exacto y lanza error si no aparece.
   */
  describe('getByName()', () => {
    it('should GET search/byMetadata with the name as query param and return the exact match', () => {
      let result: Group | undefined;

      service.getByName('TEST_CICLO_9').subscribe((g) => (result = g));

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/groups/search/byMetadata' &&
          r.params.get('query') === 'TEST_CICLO_9',
      );
      expect(req.request.method).toBe('GET');
      req.flush(groupSearchByMetadataFixture);

      expect(result).toBeDefined();
      expect(result!.name).toBe('TEST_CICLO_9');
      expect(result!.uuid).toBe('10b48251-2bd3-4dee-9f42-1d6f300af838');
    });

    it('should throw when byMetadata returns substring matches but no exact name', () => {
      let errorMessage: string | undefined;

      service.getByName('NONEXISTENT_GROUP').subscribe({
        next: () => {
          throw new Error('No debería emitir valor cuando no hay match exacto');
        },
        error: (err: Error) => {
          errorMessage = err.message;
        },
      });

      const substringOnlyResponse = {
        _embedded: {
          groups: [
            {
              uuid: 'abc',
              name: 'NONEXISTENT_GROUP_BUT_DIFFERENT',
              permanent: false,
              type: 'group',
              _links: {
                self: { href: '' },
                object: { href: '' },
                epersons: { href: '' },
                subgroups: { href: '' },
              },
            },
          ],
        },
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
        _links: { self: { href: '' } },
      };

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/groups/search/byMetadata' &&
          r.params.get('query') === 'NONEXISTENT_GROUP',
      );
      req.flush(substringOnlyResponse);

      expect(errorMessage).toBe('Grupo NONEXISTENT_GROUP no encontrado');
    });
  });

  /**
   * updateMetadata(): PATCH /api/eperson/groups/{uuid} con JSON Patch en
   * el body. El uso principal es renombrar el adminGroup auto-generado
   * por DSpace al pasar de `COMMUNITY_<uuid>_admin` a `ADMIN_<sufijo>`.
   */
  describe('updateMetadata()', () => {
    it('should PATCH /api/eperson/groups/{uuid} with JsonPatchEntry[] and return the updated Group', () => {
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/name', value: 'TEST_CICLO_9_RENAMED' },
      ];
      let result: Group | undefined;

      service
        .updateMetadata('10b48251-2bd3-4dee-9f42-1d6f300af838', patch)
        .subscribe((g) => (result = g));

      const req = httpMock.expectOne(
        '/server/api/eperson/groups/10b48251-2bd3-4dee-9f42-1d6f300af838',
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(patch);
      req.flush(groupPatchFixture);

      expect(result).toBeDefined();
      expect(result!.name).toBe('TEST_CICLO_9_RENAMED');
    });
  });

  /**
   * addSubgroup(): POST /api/eperson/groups/{parentUuid}/subgroups con
   * Content-Type text/uri-list y la URI absoluta del subgrupo en el body.
   * DSpace responde 204 No Content; el wrapper expone Observable<void>
   * para forzar al caller a manejar solo error/complete.
   */
  describe('addSubgroup()', () => {
    it('should POST text/uri-list with subgroup URI and complete with void at 204', () => {
      const subgroupUri = 'http://localhost:8080/server/api/eperson/groups/sub-uuid';
      let nextEmitted = false;
      let completed = false;

      service.addSubgroup('parent-uuid', subgroupUri).subscribe({
        next: () => (nextEmitted = true),
        complete: () => (completed = true),
      });

      const req = httpMock.expectOne(
        '/server/api/eperson/groups/parent-uuid/subgroups',
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Content-Type')).toBe('text/uri-list');
      expect(req.request.body).toBe(subgroupUri);
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(nextEmitted).toBe(true);
      expect(completed).toBe(true);
    });
  });

  /**
   * delete(): DELETE /api/eperson/groups/{uuid}. DSpace responde 204 No
   * Content; el wrapper expone Observable<void> para forzar al caller a
   * manejar solo error/complete. Lo consumen los facades transaccionales
   * del Bloque 1 al hacer rollback en cascada inversa y al borrar
   * subdirecciones (deleteSubdireccion$).
   */
  describe('delete()', () => {
    it('should DELETE /api/eperson/groups/{uuid} and complete with void at 204', () => {
      let nextEmitted = false;
      let completed = false;

      service.delete('group-uuid').subscribe({
        next: () => (nextEmitted = true),
        complete: () => (completed = true),
      });

      const req = httpMock.expectOne('/server/api/eperson/groups/group-uuid');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(nextEmitted).toBe(true);
      expect(completed).toBe(true);
    });
  });
});
