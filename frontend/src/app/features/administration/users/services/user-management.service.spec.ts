import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { firstValueFrom, of, throwError } from 'rxjs';

import { UserManagementService } from './user-management.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { EPersonApiService } from '../../../../core/api/eperson-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { DSpaceApiService } from '../../../../core/api/dspace-api.service';
import { AuthUser } from '../../../../core/auth/models/auth-session.model';
import { EPerson } from '../../../../core/api/models/eperson.model';
import { Group } from '../../../../core/api/models/group.model';
import { Community } from '../../../../core/api/models/community.model';
import { Collection } from '../../../../core/api/models/collection.model';
import { HalListResponse, Paginated } from '../../../../core/api/models/hal.model';
import { BusinessRuleError } from './business-rule-error';

/**
 * Tests de `UserManagementService` (lectura). Aprovecha `?embed=groups` para el listado
 * paginado (la proyección hidrata `_embedded` sobre la colección) y resuelve los grupos del
 * eperson individual por el subrecurso `/api/eperson/epersons/{uuid}/groups`.
 *
 * Ciclo 10 TDD — Sprint 5. Ajustado en Ciclo 13.
 */
describe('UserManagementService — lectura', () => {
  let service: UserManagementService;
  let currentAuthUser: WritableSignal<AuthUser | null>;
  let listEPersonsFn: ReturnType<typeof vi.fn>;
  let getOneEPersonFn: ReturnType<typeof vi.fn>;
  let getGroupsOfEPersonFn: ReturnType<typeof vi.fn>;
  let getCommunityFn: ReturnType<typeof vi.fn>;

  /** Construye el bloque HAL que DSpace devuelve con ?embed=groups. */
  function embeddedGroups(groups: Group[]): HalListResponse<Group> {
    return {
      _embedded: { groups },
      _links: { self: { href: '' } },
      page: { size: groups.length, totalElements: groups.length, totalPages: 1, number: 0 },
    };
  }

  /** Construye un EPerson con la forma canónica del contrato REST de DSpace. */
  function buildEPerson(input: {
    uuid: string;
    email: string;
    firstName: string;
    lastName: string;
    canLogIn?: boolean;
    lastActive?: string | null;
    groups?: Group[];
  }): EPerson {
    return {
      uuid: input.uuid,
      name: input.email,
      email: input.email,
      handle: null,
      netid: null,
      lastActive: input.lastActive ?? null,
      canLogIn: input.canLogIn ?? true,
      requireCertificate: false,
      selfRegistered: false,
      type: 'eperson',
      metadata: {
        'eperson.firstname': [
          { value: input.firstName, language: null, authority: '', confidence: -1 },
        ],
        'eperson.lastname': [
          { value: input.lastName, language: null, authority: '', confidence: -1 },
        ],
      },
      _embedded: input.groups ? { groups: embeddedGroups(input.groups) } : undefined,
    };
  }

  /** Grupo global Administrator (RN-07); _links.object vacío por no colgar de un DSO. */
  const administratorGroup: Group = {
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
  };

  /** adminGroup de la community Educación Básica (RN-08); uuid del DSO en _links.object.href. */
  const adminGroupEducacionBasica: Group = {
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
  };

  /** adminGroup de otra community, para validar el filtro por subdivisión. */
  const adminGroupTrabajoCultura: Group = {
    uuid: 'group-admin-trabajo-cultura',
    name: 'COMMUNITY_trabajo_cultura_ADMIN',
    permanent: false,
    type: 'group',
    _links: {
      self: { href: '/server/api/eperson/groups/group-admin-trabajo-cultura' },
      object: { href: '/server/api/core/communities/community-trabajo-cultura' },
      epersons: { href: '/server/api/eperson/groups/group-admin-trabajo-cultura/epersons' },
      subgroups: { href: '/server/api/eperson/groups/group-admin-trabajo-cultura/subgroups' },
    },
  };

  const communityEducacionBasica: Community = {
    uuid: 'community-educacion-basica',
    name: 'Educación Básica',
    handle: '123456789/1',
    metadata: {},
    archivedItemsCount: 0,
    type: 'community',
  };

  const communityTrabajoCultura: Community = {
    uuid: 'community-trabajo-cultura',
    name: 'Educación para el Trabajo y la Cultura',
    handle: '123456789/2',
    metadata: {},
    archivedItemsCount: 0,
    type: 'community',
  };

  function emptyPaginated<T>(): Paginated<T> {
    return { items: [], totalElements: 0, totalPages: 0, size: 0, page: 0 };
  }

  function paginated<T>(items: T[], size = 20, page = 0): Paginated<T> {
    return { items, totalElements: items.length, totalPages: 1, size, page };
  }

  beforeEach(() => {
    currentAuthUser = signal<AuthUser | null>(null);
    listEPersonsFn = vi.fn().mockReturnValue(of(emptyPaginated<EPerson>()));
    getOneEPersonFn = vi.fn();
    // Por defecto, el subrecurso /groups devuelve vacío. Cada test que
    // necesite un caller con rol resuelto lo sobreescribe con paginated([...]).
    getGroupsOfEPersonFn = vi.fn().mockReturnValue(of(paginated<Group>([])));
    getCommunityFn = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        UserManagementService,
        { provide: AuthService, useValue: { currentUser: currentAuthUser } },
        {
          provide: EPersonApiService,
          useValue: { list: listEPersonsFn, getOne: getOneEPersonFn },
        },
        // En lectura ya se usa: getGroupsOfEPerson resuelve los grupos de
        // single epersons (caller y target) sin depender de `?embed=groups`.
        { provide: GroupApiService, useValue: { getGroupsOfEPerson: getGroupsOfEPersonFn } },
        { provide: DSpaceApiService, useValue: { getCommunity: getCommunityFn } },
      ],
    });

    service = TestBed.inject(UserManagementService);
  });

  /** Fuente de verdad del usuario logueado con su rol ya resuelto. */
  describe('currentUserView$', () => {
    /** Sin sesión no hay petición al backend. */
    it('should emit null when AuthService.currentUser is null', async () => {
      currentAuthUser.set(null);

      const result = await firstValueFrom(service.currentUserView$);

      expect(result).toBeNull();
      expect(getOneEPersonFn).not.toHaveBeenCalled();
      expect(getGroupsOfEPersonFn).not.toHaveBeenCalled();
      expect(getCommunityFn).not.toHaveBeenCalled();
    });

    /** Administrator (RN-07) mapea a superadmin con subdivision=null. */
    it('should emit UserView with role=superadmin and subdivision=null when auth user belongs to Administrator group', async () => {
      currentAuthUser.set({
        uuid: 'eperson-super',
        email: 'carlos.ramirez@mineduc.gob.gt',
        firstName: 'Carlos',
        lastName: 'Ramírez',
      });
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-super',
            email: 'carlos.ramirez@mineduc.gob.gt',
            firstName: 'Carlos',
            lastName: 'Ramírez',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([administratorGroup])));

      const result = await firstValueFrom(service.currentUserView$);

      expect(result).toEqual({
        uuid: 'eperson-super',
        email: 'carlos.ramirez@mineduc.gob.gt',
        firstName: 'Carlos',
        lastName: 'Ramírez',
        role: 'superadmin',
        subdivision: null,
        status: 'active',
        lastActive: null,
      });
      // El single eperson va sin embed; los grupos se piden por separado.
      expect(getOneEPersonFn).toHaveBeenCalledWith('eperson-super');
      expect(getGroupsOfEPersonFn).toHaveBeenCalledWith('eperson-super');
      expect(getCommunityFn).not.toHaveBeenCalled();
    });

    /** adminGroup de una community (RN-08): subdivision = nombre de la community. */
    it('should emit UserView with role=admin_subdireccion and the resolved community name as subdivision', async () => {
      currentAuthUser.set({
        uuid: 'eperson-admin-eb',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-admin-eb',
            email: 'mario.garcia@mineduc.gob.gt',
            firstName: 'Mario',
            lastName: 'García',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(
        of(paginated<Group>([adminGroupEducacionBasica])),
      );
      getCommunityFn.mockReturnValue(of(communityEducacionBasica));

      const result = await firstValueFrom(service.currentUserView$);

      expect(result?.role).toBe('admin_subdireccion');
      expect(result?.subdivision).toBe('Educación Básica');
      expect(getCommunityFn).toHaveBeenCalledWith('community-educacion-basica');
    });

    /**
     * Invariante: todo eperson en el facade debe tener un grupo de rol del portal. Si el
     * subrecurso `/groups` devuelve vacío para el caller, el Observable propaga error y el
     * `LoginComponent` reacciona cerrando sesión.
     */
    it('should throw an error when the authenticated user has no role group', async () => {
      currentAuthUser.set({
        uuid: 'eperson-huerfano',
        email: 'huerfano@mineduc.gob.gt',
        firstName: 'Sin',
        lastName: 'Grupo',
      });
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-huerfano',
            email: 'huerfano@mineduc.gob.gt',
            firstName: 'Sin',
            lastName: 'Grupo',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([])));

      await expect(firstValueFrom(service.currentUserView$)).rejects.toBeInstanceOf(Error);
    });
  });

  /** Listado paginado según el alcance del caller (superadmin ve todo, admin ve su subdivisión). */
  describe('getVisibleUsers$()', () => {
    /** La paginación se delega al wrapper HTTP y siempre viaja con embed=groups. */
    it('should call EPersonApi.list with the provided params and embed=groups', async () => {
      currentAuthUser.set({
        uuid: 'eperson-super',
        email: 'carlos.ramirez@mineduc.gob.gt',
        firstName: 'Carlos',
        lastName: 'Ramírez',
      });
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-super',
            email: 'carlos.ramirez@mineduc.gob.gt',
            firstName: 'Carlos',
            lastName: 'Ramírez',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([administratorGroup])));

      await firstValueFrom(service.getVisibleUsers$({ size: 50, page: 2 }));

      expect(listEPersonsFn).toHaveBeenCalledWith({ size: 50, page: 2, embed: 'groups' });
    });

    /** Cada EPerson se mapea con rol/subdivisión; los metadatos de paginación se preservan. */
    it('should emit Paginated<UserView> with role and subdivision resolved per eperson', async () => {
      currentAuthUser.set({
        uuid: 'eperson-super',
        email: 'carlos.ramirez@mineduc.gob.gt',
        firstName: 'Carlos',
        lastName: 'Ramírez',
      });
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-super',
            email: 'carlos.ramirez@mineduc.gob.gt',
            firstName: 'Carlos',
            lastName: 'Ramírez',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([administratorGroup])));
      getCommunityFn.mockImplementation((uuid: string) => {
        if (uuid === 'community-educacion-basica') return of(communityEducacionBasica);
        return of(undefined);
      });
      const mario = buildEPerson({
        uuid: 'eperson-mario',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
        groups: [adminGroupEducacionBasica],
      });
      listEPersonsFn.mockReturnValue(of(paginated<EPerson>([mario], 20, 0)));

      const result = await firstValueFrom(service.getVisibleUsers$({ size: 20, page: 0 }));

      expect(result.items.length).toBe(1);
      expect(result.items[0]).toEqual({
        uuid: 'eperson-mario',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
        role: 'admin_subdireccion',
        subdivision: 'Educación Básica',
        status: 'active',
        lastActive: null,
      });
      expect(result.totalElements).toBe(1);
      expect(result.size).toBe(20);
      expect(result.page).toBe(0);
    });

    /** RN-08: filtro client-side por subdivisión (DSpace no expone "epersons por community"). */
    it('should restrict the list to users of the caller subdivision when role is admin_subdireccion', async () => {
      currentAuthUser.set({
        uuid: 'eperson-admin-eb',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-admin-eb',
            email: 'mario.garcia@mineduc.gob.gt',
            firstName: 'Mario',
            lastName: 'García',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(
        of(paginated<Group>([adminGroupEducacionBasica])),
      );
      getCommunityFn.mockImplementation((uuid: string) => {
        if (uuid === 'community-educacion-basica') return of(communityEducacionBasica);
        if (uuid === 'community-trabajo-cultura') return of(communityTrabajoCultura);
        return of(undefined);
      });
      const mario = buildEPerson({
        uuid: 'eperson-mario',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
        groups: [adminGroupEducacionBasica],
      });
      const lucia = buildEPerson({
        uuid: 'eperson-lucia',
        email: 'lucia.mendez@mineduc.gob.gt',
        firstName: 'Lucía',
        lastName: 'Méndez',
        groups: [adminGroupTrabajoCultura],
      });
      const rosa = buildEPerson({
        uuid: 'eperson-rosa',
        email: 'rosa.juarez@mineduc.gob.gt',
        firstName: 'Rosa',
        lastName: 'Juárez',
        groups: [adminGroupEducacionBasica],
      });
      listEPersonsFn.mockReturnValue(of(paginated<EPerson>([mario, lucia, rosa], 20, 0)));

      const result = await firstValueFrom(service.getVisibleUsers$({ size: 20, page: 0 }));

      expect(result.items.map((u) => u.uuid).sort()).toEqual(
        ['eperson-mario', 'eperson-rosa'].sort(),
      );
      expect(result.items.every((u) => u.subdivision === 'Educación Básica')).toBe(true);
    });

    /**
     * Si por una desviación externa (manipulación directa en `/server/api` o un eperson
     * preexistente) un usuario llega al listado sin grupo de rol del portal, se lo filtra
     * silenciosamente sin contaminar el dominio con un rol simbólico extra.
     */
    it('should drop orphan epersons silently from the visible list', async () => {
      currentAuthUser.set({
        uuid: 'eperson-super',
        email: 'carlos.ramirez@mineduc.gob.gt',
        firstName: 'Carlos',
        lastName: 'Ramírez',
      });
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-super',
            email: 'carlos.ramirez@mineduc.gob.gt',
            firstName: 'Carlos',
            lastName: 'Ramírez',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([administratorGroup])));
      const huerfano = buildEPerson({
        uuid: 'eperson-huerfano',
        email: 'huerfano@mineduc.gob.gt',
        firstName: 'Sin',
        lastName: 'Grupo',
        groups: [],
      });
      const mario = buildEPerson({
        uuid: 'eperson-mario',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
        groups: [adminGroupEducacionBasica],
      });
      getCommunityFn.mockReturnValue(of(communityEducacionBasica));
      listEPersonsFn.mockReturnValue(of(paginated<EPerson>([huerfano, mario], 20, 0)));

      const result = await firstValueFrom(service.getVisibleUsers$({ size: 20, page: 0 }));

      expect(result.items.map((u) => u.uuid)).toEqual(['eperson-mario']);
    });
  });
});

/**
 * Tests de `UserManagementService` (mutaciones). El facade cablea la creación del eperson con
 * la asignación al grupo de su rol: `superadmin` → `Administrator`; `admin_subdireccion` →
 * `adminGroup` de la community; `personal_delegado` → `submittersGroup` de cada collection.
 * La creación es transaccional (rollback con `delete` si la asignación al grupo falla) y el
 * cambio de rol agrega al grupo nuevo antes de remover del viejo.
 *
 * Ciclo 11 TDD — Sprint 5. Ajustado en Ciclo 13.
 */
describe('UserManagementService — mutaciones', () => {
  let service: UserManagementService;
  let currentAuthUser: WritableSignal<AuthUser | null>;
  let getOneEPersonFn: ReturnType<typeof vi.fn>;
  let getGroupsOfEPersonFn: ReturnType<typeof vi.fn>;
  let listEPersonsFn: ReturnType<typeof vi.fn>;
  let createEPersonFn: ReturnType<typeof vi.fn>;
  let deleteEPersonFn: ReturnType<typeof vi.fn>;
  let setActiveEPersonFn: ReturnType<typeof vi.fn>;
  let resendRegistrationFn: ReturnType<typeof vi.fn>;
  let addMemberToGroupFn: ReturnType<typeof vi.fn>;
  let removeMemberFromGroupFn: ReturnType<typeof vi.fn>;
  let getMembersOfGroupFn: ReturnType<typeof vi.fn>;
  let findAdministratorGroupFn: ReturnType<typeof vi.fn>;
  let getCommunityFn: ReturnType<typeof vi.fn>;
  let getCollectionFn: ReturnType<typeof vi.fn>;

  /** Bloque HAL de grupos embebidos (misma forma que en el bloque de lectura). */
  function embeddedGroups(groups: Group[]): HalListResponse<Group> {
    return {
      _embedded: { groups },
      _links: { self: { href: '' } },
      page: { size: groups.length, totalElements: groups.length, totalPages: 1, number: 0 },
    };
  }

  /** EPerson canónico; para mutaciones no necesita metadata completa. */
  function buildEPerson(input: {
    uuid: string;
    email: string;
    firstName?: string;
    lastName?: string;
    canLogIn?: boolean;
    groups?: Group[];
  }): EPerson {
    return {
      uuid: input.uuid,
      name: input.email,
      email: input.email,
      handle: null,
      netid: null,
      lastActive: null,
      canLogIn: input.canLogIn ?? true,
      requireCertificate: false,
      selfRegistered: false,
      type: 'eperson',
      metadata: {
        'eperson.firstname': [
          { value: input.firstName ?? '', language: null, authority: '', confidence: -1 },
        ],
        'eperson.lastname': [
          { value: input.lastName ?? '', language: null, authority: '', confidence: -1 },
        ],
      },
      _embedded: input.groups ? { groups: embeddedGroups(input.groups) } : undefined,
    };
  }

  /** Grupo global Administrator (RN-07). */
  const administratorGroup: Group = {
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
  };

  /** adminGroup de la community Educación Básica (RN-08). */
  const adminGroupEducacionBasica: Group = {
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
  };

  /** submittersGroup de una collection (RN-13). */
  function submittersGroupOf(collectionUuid: string, groupUuid: string): Group {
    return {
      uuid: groupUuid,
      name: `COLLECTION_${collectionUuid}_SUBMIT`,
      permanent: false,
      type: 'group',
      _links: {
        self: { href: `/server/api/eperson/groups/${groupUuid}` },
        object: { href: `/server/api/core/collections/${collectionUuid}` },
        epersons: { href: `/server/api/eperson/groups/${groupUuid}/epersons` },
        subgroups: { href: `/server/api/eperson/groups/${groupUuid}/subgroups` },
      },
    };
  }

  const communityEducacionBasica: Community = {
    uuid: 'community-educacion-basica',
    name: 'Educación Básica',
    handle: '123456789/1',
    metadata: {},
    archivedItemsCount: 0,
    type: 'community',
    _embedded: { adminGroup: adminGroupEducacionBasica },
  };

  const peacGroup = submittersGroupOf('collection-peac', 'group-submit-peac');
  const collectionPeac: Collection = {
    uuid: 'collection-peac',
    name: 'PEAC',
    handle: '123456789/10',
    metadata: {},
    archivedItemsCount: 0,
    type: 'collection',
    _embedded: { submittersGroup: peacGroup },
  };

  const proneaGroup = submittersGroupOf('collection-pronea', 'group-submit-pronea');
  const collectionPronea: Collection = {
    uuid: 'collection-pronea',
    name: 'PRONEA',
    handle: '123456789/11',
    metadata: {},
    archivedItemsCount: 0,
    type: 'collection',
    _embedded: { submittersGroup: proneaGroup },
  };

  function emptyPaginated<T>(): Paginated<T> {
    return { items: [], totalElements: 0, totalPages: 0, size: 0, page: 0 };
  }

  function paginated<T>(items: T[], totalElements = items.length): Paginated<T> {
    return { items, totalElements, totalPages: 1, size: items.length, page: 0 };
  }

  beforeEach(() => {
    currentAuthUser = signal<AuthUser | null>({
      uuid: 'eperson-caller',
      email: 'carlos.ramirez@mineduc.gob.gt',
      firstName: 'Carlos',
      lastName: 'Ramírez',
    });

    // currentUserView$ pide el eperson y, por separado, sus grupos.
    // Por defecto el caller es superadmin (miembro de Administrator).
    getOneEPersonFn = vi.fn().mockReturnValue(
      of(
        buildEPerson({
          uuid: 'eperson-caller',
          email: 'carlos.ramirez@mineduc.gob.gt',
          firstName: 'Carlos',
          lastName: 'Ramírez',
        }),
      ),
    );
    getGroupsOfEPersonFn = vi.fn().mockReturnValue(of(paginated<Group>([administratorGroup])));
    listEPersonsFn = vi.fn().mockReturnValue(of(emptyPaginated<EPerson>()));
    createEPersonFn = vi.fn();
    // Por defecto, delete no se invoca: cada test que valide rollback la
    // sobreescribe con su propio mock para verificar el contrato.
    deleteEPersonFn = vi.fn().mockReturnValue(of(undefined));
    setActiveEPersonFn = vi.fn();
    resendRegistrationFn = vi.fn().mockReturnValue(of(undefined));
    addMemberToGroupFn = vi.fn().mockReturnValue(of(administratorGroup));
    removeMemberFromGroupFn = vi.fn().mockReturnValue(of(undefined));
    // Por defecto: el grupo Administrator tiene 1 miembro activo (el caller).
    getMembersOfGroupFn = vi.fn().mockReturnValue(
      of(
        paginated<EPerson>([
          buildEPerson({
            uuid: 'eperson-caller',
            email: 'carlos.ramirez@mineduc.gob.gt',
          }),
        ]),
      ),
    );
    findAdministratorGroupFn = vi.fn().mockReturnValue(of(administratorGroup));
    getCommunityFn = vi.fn().mockReturnValue(of(communityEducacionBasica));
    getCollectionFn = vi.fn().mockImplementation((uuid: string) => {
      if (uuid === 'collection-peac') return of(collectionPeac);
      if (uuid === 'collection-pronea') return of(collectionPronea);
      return of(undefined);
    });

    TestBed.configureTestingModule({
      providers: [
        UserManagementService,
        { provide: AuthService, useValue: { currentUser: currentAuthUser } },
        {
          provide: EPersonApiService,
          useValue: {
            getOne: getOneEPersonFn,
            list: listEPersonsFn,
            create: createEPersonFn,
            delete: deleteEPersonFn,
            setActive: setActiveEPersonFn,
            resendRegistration: resendRegistrationFn,
          },
        },
        {
          provide: GroupApiService,
          useValue: {
            getGroupsOfEPerson: getGroupsOfEPersonFn,
            addMemberToGroup: addMemberToGroupFn,
            removeMemberFromGroup: removeMemberFromGroupFn,
            getMembersOfGroup: getMembersOfGroupFn,
            findAdministratorGroup: findAdministratorGroupFn,
          },
        },
        {
          provide: DSpaceApiService,
          useValue: {
            getCommunity: getCommunityFn,
            getCollection: getCollectionFn,
          },
        },
      ],
    });

    service = TestBed.inject(UserManagementService);
  });

  /** Crea usuarios nuevos y los asigna al grupo correcto según el rol. */
  describe('createUser$()', () => {
    /** RN-02: correo institucional obligatorio. */
    it('should reject with BusinessRuleError EMAIL_INVALID when email does not end in @mineduc.gob.gt', async () => {
      const promise = firstValueFrom(
        service.createUser$({
          email: 'juan.perez@gmail.com',
          firstName: 'Juan',
          lastName: 'Pérez',
          role: 'personal_delegado',
          subdivisionCommunityUuid: 'community-educacion-basica',
          collectionUuids: ['collection-peac'],
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'EMAIL_INVALID' });
      expect(createEPersonFn).not.toHaveBeenCalled();
      expect(addMemberToGroupFn).not.toHaveBeenCalled();
    });

    /** RN-08: admin_subdireccion y personal_delegado exigen subdivisión. */
    it('should reject with BusinessRuleError SUBDIVISION_REQUIRED when role is not superadmin and no subdivisionCommunityUuid is given', async () => {
      const promise = firstValueFrom(
        service.createUser$({
          email: 'rosa.juarez@mineduc.gob.gt',
          firstName: 'Rosa',
          lastName: 'Juárez',
          role: 'admin_subdireccion',
          subdivisionCommunityUuid: null,
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'SUBDIVISION_REQUIRED' });
      expect(createEPersonFn).not.toHaveBeenCalled();
    });

    /** RN-08: el admin de subdirección no puede crear cuentas Superadmin. */
    it('should reject with BusinessRuleError INSUFFICIENT_PRIVILEGES when the caller is admin_subdireccion and tries to create a superadmin', async () => {
      // Caller = admin_subdireccion de Educación Básica.
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-caller',
            email: 'mario.garcia@mineduc.gob.gt',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([adminGroupEducacionBasica])));

      const promise = firstValueFrom(
        service.createUser$({
          email: 'nuevo.super@mineduc.gob.gt',
          firstName: 'Nuevo',
          lastName: 'Super',
          role: 'superadmin',
          subdivisionCommunityUuid: null,
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
      expect(createEPersonFn).not.toHaveBeenCalled();
      expect(addMemberToGroupFn).not.toHaveBeenCalled();
    });

    /** RN-08: el admin de subdirección no puede crear otro admin de subdirección. */
    it('should reject with BusinessRuleError INSUFFICIENT_PRIVILEGES when the caller is admin_subdireccion and tries to create another admin_subdireccion', async () => {
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-caller',
            email: 'mario.garcia@mineduc.gob.gt',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([adminGroupEducacionBasica])));

      const promise = firstValueFrom(
        service.createUser$({
          email: 'nuevo.admin@mineduc.gob.gt',
          firstName: 'Nuevo',
          lastName: 'Admin',
          role: 'admin_subdireccion',
          subdivisionCommunityUuid: 'community-educacion-basica',
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
      expect(createEPersonFn).not.toHaveBeenCalled();
    });

    /** RN-08: el admin de subdirección solo puede crear personal delegado DENTRO de su propia community. */
    it('should reject with BusinessRuleError INSUFFICIENT_PRIVILEGES when the caller is admin_subdireccion and targets a different community', async () => {
      // Caller = admin_subdireccion de Educación Básica, intenta crear delegado en otra community.
      getOneEPersonFn.mockReturnValue(
        of(
          buildEPerson({
            uuid: 'eperson-caller',
            email: 'mario.garcia@mineduc.gob.gt',
          }),
        ),
      );
      getGroupsOfEPersonFn.mockReturnValue(of(paginated<Group>([adminGroupEducacionBasica])));

      const promise = firstValueFrom(
        service.createUser$({
          email: 'delegado.ajeno@mineduc.gob.gt',
          firstName: 'Delegado',
          lastName: 'Ajeno',
          role: 'personal_delegado',
          subdivisionCommunityUuid: 'community-otra-subdireccion',
          collectionUuids: ['collection-peac'],
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
      expect(createEPersonFn).not.toHaveBeenCalled();
    });

    /** Happy path admin_subdireccion: community → adminGroup → addMember + correo. */
    it('should create the eperson and add it to the community adminGroup when role is admin_subdireccion', async () => {
      const newEperson = buildEPerson({
        uuid: 'new-admin',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      createEPersonFn.mockReturnValue(of(newEperson));

      const result = await firstValueFrom(
        service.createUser$({
          email: 'mario.garcia@mineduc.gob.gt',
          firstName: 'Mario',
          lastName: 'García',
          role: 'admin_subdireccion',
          subdivisionCommunityUuid: 'community-educacion-basica',
        }),
      );

      expect(createEPersonFn).toHaveBeenCalledWith({
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      expect(getCommunityFn).toHaveBeenCalledWith('community-educacion-basica', {
        embed: 'adminGroup',
      });
      expect(addMemberToGroupFn).toHaveBeenCalledWith(
        'group-admin-educacion-basica',
        'new-admin',
      );
      expect(resendRegistrationFn).toHaveBeenCalledWith('mario.garcia@mineduc.gob.gt');
      expect(deleteEPersonFn).not.toHaveBeenCalled();
      expect(result).toEqual(newEperson);
    });

    /** Happy path personal_delegado: collection(s) → submittersGroup → addMember + correo. */
    it('should create the eperson and add it to each collection submittersGroup when role is personal_delegado', async () => {
      const newEperson = buildEPerson({
        uuid: 'new-delegado',
        email: 'rosa.juarez@mineduc.gob.gt',
        firstName: 'Rosa',
        lastName: 'Juárez',
      });
      createEPersonFn.mockReturnValue(of(newEperson));

      await firstValueFrom(
        service.createUser$({
          email: 'rosa.juarez@mineduc.gob.gt',
          firstName: 'Rosa',
          lastName: 'Juárez',
          role: 'personal_delegado',
          subdivisionCommunityUuid: 'community-educacion-basica',
          collectionUuids: ['collection-peac', 'collection-pronea'],
        }),
      );

      expect(createEPersonFn).toHaveBeenCalledOnce();
      expect(getCollectionFn).toHaveBeenCalledWith('collection-peac', {
        embed: 'submittersGroup',
      });
      expect(getCollectionFn).toHaveBeenCalledWith('collection-pronea', {
        embed: 'submittersGroup',
      });
      expect(addMemberToGroupFn).toHaveBeenCalledWith('group-submit-peac', 'new-delegado');
      expect(addMemberToGroupFn).toHaveBeenCalledWith('group-submit-pronea', 'new-delegado');
      expect(addMemberToGroupFn).toHaveBeenCalledTimes(2);
      expect(resendRegistrationFn).toHaveBeenCalledWith('rosa.juarez@mineduc.gob.gt');
      expect(deleteEPersonFn).not.toHaveBeenCalled();
    });

    /**
     * Invariante transaccional: si la asignación al grupo falla después de
     * crear el eperson, hay que deshacer el POST llamando a delete(uuid)
     * para no dejar un eperson huérfano (sin grupo de rol del portal). El
     * error se propaga al caller para que el toast del UI lo muestre.
     */
    it('should rollback the created eperson when adding to the role group fails', async () => {
      const newEperson = buildEPerson({
        uuid: 'new-admin',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      createEPersonFn.mockReturnValue(of(newEperson));
      const groupError = new Error('boom: addMemberToGroup falló');
      addMemberToGroupFn.mockReturnValueOnce(throwError(() => groupError));

      const promise = firstValueFrom(
        service.createUser$({
          email: 'mario.garcia@mineduc.gob.gt',
          firstName: 'Mario',
          lastName: 'García',
          role: 'admin_subdireccion',
          subdivisionCommunityUuid: 'community-educacion-basica',
        }),
      );

      await expect(promise).rejects.toBe(groupError);
      expect(deleteEPersonFn).toHaveBeenCalledWith('new-admin');
      expect(resendRegistrationFn).not.toHaveBeenCalled();
    });

    /**
     * Si el correo de registración falla, el eperson YA tiene grupo asignado:
     * no se hace rollback (la cuenta es válida) pero sí se propaga el error
     * para que el operador sepa que tiene que reenviar la invitación con el
     * botón de "restablecer contraseña" desde la grilla.
     */
    it('should not rollback when resendRegistration fails after the group has been assigned', async () => {
      const newEperson = buildEPerson({
        uuid: 'new-admin',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      createEPersonFn.mockReturnValue(of(newEperson));
      const mailError = new Error('boom: resendRegistration falló');
      resendRegistrationFn.mockReturnValueOnce(throwError(() => mailError));

      const promise = firstValueFrom(
        service.createUser$({
          email: 'mario.garcia@mineduc.gob.gt',
          firstName: 'Mario',
          lastName: 'García',
          role: 'admin_subdireccion',
          subdivisionCommunityUuid: 'community-educacion-basica',
        }),
      );

      await expect(promise).rejects.toBe(mailError);
      expect(addMemberToGroupFn).toHaveBeenCalled();
      expect(deleteEPersonFn).not.toHaveBeenCalled();
    });
  });

  /** Desactiva y reactiva conmutando canLogIn, sin borrar el eperson. */
  describe('deactivateUser$()', () => {
    /** RN-12: un usuario no puede desactivarse a sí mismo. */
    it('should reject with BusinessRuleError SELF_DEACTIVATE when uuid equals the current caller', async () => {
      const promise = firstValueFrom(service.deactivateUser$('eperson-caller'));

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'SELF_DEACTIVATE' });
      expect(setActiveEPersonFn).not.toHaveBeenCalled();
    });

    /** RN-11: no se puede desactivar al último superadmin activo. */
    it('should reject with BusinessRuleError LAST_SUPERADMIN when deactivating a superadmin who is the only active member of Administrator', async () => {
      // Administrator tiene un único miembro y el target está en ese grupo.
      getMembersOfGroupFn.mockReturnValue(
        of(
          paginated<EPerson>([
            buildEPerson({ uuid: 'lonely-super', email: 'a@mineduc.gob.gt', canLogIn: true }),
          ]),
        ),
      );
      listEPersonsFn.mockReturnValue(of(emptyPaginated<EPerson>()));

      const promise = firstValueFrom(service.deactivateUser$('lonely-super'));

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'LAST_SUPERADMIN' });
      expect(setActiveEPersonFn).not.toHaveBeenCalled();
    });

    /** Happy path: conmuta canLogIn a false vía EPersonApi.setActive. */
    it('should call EPersonApi.setActive(uuid, false) and return the updated eperson', async () => {
      const updated = buildEPerson({
        uuid: 'target-eperson',
        email: 'target@mineduc.gob.gt',
        canLogIn: false,
      });
      setActiveEPersonFn.mockReturnValue(of(updated));

      const result = await firstValueFrom(service.deactivateUser$('target-eperson'));

      expect(setActiveEPersonFn).toHaveBeenCalledWith('target-eperson', false);
      expect(result).toEqual(updated);
    });
  });

  /** Reactivación: espejo de deactivate sin self-check porque el caller no está desactivado. */
  describe('reactivateUser$()', () => {
    it('should call EPersonApi.setActive(uuid, true) and return the updated eperson', async () => {
      const updated = buildEPerson({
        uuid: 'target-eperson',
        email: 'target@mineduc.gob.gt',
        canLogIn: true,
      });
      setActiveEPersonFn.mockReturnValue(of(updated));

      const result = await firstValueFrom(service.reactivateUser$('target-eperson'));

      expect(setActiveEPersonFn).toHaveBeenCalledWith('target-eperson', true);
      expect(result).toEqual(updated);
    });
  });

  /** Cambio de rol = mover al eperson entre grupos (add nuevo + remove viejo). */
  describe('changeUserRole$()', () => {
    /** RN-13: solo el superadmin puede promover entre adminGroup/Administrator. */
    it('should reject with BusinessRuleError INSUFFICIENT_PRIVILEGES when the caller is admin_subdireccion and tries to change a user role', async () => {
      const targetEperson = buildEPerson({
        uuid: 'target-eperson',
        email: 'rosa.juarez@mineduc.gob.gt',
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') {
          return of(
            buildEPerson({
              uuid: 'eperson-caller',
              email: 'mario.garcia@mineduc.gob.gt',
            }),
          );
        }
        if (uuid === 'target-eperson') return of(targetEperson);
        return of(undefined);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') return of(paginated<Group>([adminGroupEducacionBasica]));
        if (uuid === 'target-eperson') return of(paginated<Group>([peacGroup]));
        return of(emptyPaginated<Group>());
      });

      const promise = firstValueFrom(
        service.changeUserRole$({
          uuid: 'target-eperson',
          newRole: 'superadmin',
          newSubdivisionCommunityUuid: null,
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
      expect(removeMemberFromGroupFn).not.toHaveBeenCalled();
      expect(addMemberToGroupFn).not.toHaveBeenCalled();
    });

    /** RN-27: nadie puede cambiar su propio rol (reusa SELF_DEACTIVATE). */
    it('should reject with BusinessRuleError SELF_DEACTIVATE when the caller targets its own uuid', async () => {
      const promise = firstValueFrom(
        service.changeUserRole$({
          uuid: 'eperson-caller',
          newRole: 'personal_delegado',
          newSubdivisionCommunityUuid: 'community-educacion-basica',
          newCollectionUuids: ['collection-peac'],
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'SELF_DEACTIVATE' });
      expect(removeMemberFromGroupFn).not.toHaveBeenCalled();
      expect(addMemberToGroupFn).not.toHaveBeenCalled();
    });

    /** RN-28: democión del último superadmin activo (reusa LAST_SUPERADMIN). */
    it('should reject with BusinessRuleError LAST_SUPERADMIN when demoting the last active superadmin', async () => {
      const lonelySuper = buildEPerson({
        uuid: 'lonely-super',
        email: 'last@mineduc.gob.gt',
        canLogIn: true,
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') {
          return of(
            buildEPerson({
              uuid: 'eperson-caller',
              email: 'carlos.ramirez@mineduc.gob.gt',
            }),
          );
        }
        if (uuid === 'lonely-super') return of(lonelySuper);
        return of(undefined);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') return of(paginated<Group>([administratorGroup]));
        if (uuid === 'lonely-super') return of(paginated<Group>([administratorGroup]));
        return of(emptyPaginated<Group>());
      });
      // Solo un activo en Administrator: el target. La guarda corta.
      getMembersOfGroupFn.mockReturnValue(
        of(
          paginated<EPerson>([
            buildEPerson({ uuid: 'lonely-super', email: 'last@mineduc.gob.gt', canLogIn: true }),
          ]),
        ),
      );

      const promise = firstValueFrom(
        service.changeUserRole$({
          uuid: 'lonely-super',
          newRole: 'personal_delegado',
          newSubdivisionCommunityUuid: 'community-educacion-basica',
          newCollectionUuids: ['collection-peac'],
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(promise).rejects.toMatchObject({ code: 'LAST_SUPERADMIN' });
      expect(removeMemberFromGroupFn).not.toHaveBeenCalled();
      expect(addMemberToGroupFn).not.toHaveBeenCalled();
    });

    /**
     * Happy path con orden invertido: el facade primero agrega al target al
     * grupo destino y recién después lo retira del grupo previo. Ese orden
     * es lo que mantiene la invariante "todo eperson tiene grupo de rol":
     * si addMemberToGroup falla a mitad de camino, el target sigue
     * perteneciendo al grupo viejo en lugar de quedar huérfano.
     */
    it('should add the target to the new group BEFORE removing it from the previous one', async () => {
      const callOrder: string[] = [];
      addMemberToGroupFn.mockImplementation(() => {
        callOrder.push('add');
        return of(administratorGroup);
      });
      removeMemberFromGroupFn.mockImplementation(() => {
        callOrder.push('remove');
        return of(undefined);
      });
      const targetEperson = buildEPerson({
        uuid: 'target-eperson',
        email: 'mario.garcia@mineduc.gob.gt',
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') {
          return of(
            buildEPerson({
              uuid: 'eperson-caller',
              email: 'carlos.ramirez@mineduc.gob.gt',
            }),
          );
        }
        if (uuid === 'target-eperson') return of(targetEperson);
        return of(undefined);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') return of(paginated<Group>([administratorGroup]));
        if (uuid === 'target-eperson') return of(paginated<Group>([adminGroupEducacionBasica]));
        return of(emptyPaginated<Group>());
      });

      await firstValueFrom(
        service.changeUserRole$({
          uuid: 'target-eperson',
          newRole: 'superadmin',
          newSubdivisionCommunityUuid: null,
        }),
      );

      expect(addMemberToGroupFn).toHaveBeenCalledWith(
        'group-administrator',
        'target-eperson',
      );
      expect(removeMemberFromGroupFn).toHaveBeenCalledWith(
        'group-admin-educacion-basica',
        'target-eperson',
      );
      // El primer add ocurre antes del primer remove.
      expect(callOrder.indexOf('add')).toBeLessThan(callOrder.indexOf('remove'));
    });

    /**
     * Atomicidad del cambio de rol: si la asignación al grupo nuevo falla,
     * NO se debe ejecutar la baja del grupo previo. De lo contrario, el
     * target quedaría huérfano (sin grupo de rol) por culpa de un fallo
     * intermitente, exactamente la condición que la invariante reescrita
     * busca eliminar.
     */
    it('should NOT remove the target from its previous group when the add to the new group fails', async () => {
      const targetEperson = buildEPerson({
        uuid: 'target-eperson',
        email: 'mario.garcia@mineduc.gob.gt',
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') {
          return of(
            buildEPerson({
              uuid: 'eperson-caller',
              email: 'carlos.ramirez@mineduc.gob.gt',
            }),
          );
        }
        if (uuid === 'target-eperson') return of(targetEperson);
        return of(undefined);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-caller') return of(paginated<Group>([administratorGroup]));
        if (uuid === 'target-eperson') return of(paginated<Group>([adminGroupEducacionBasica]));
        return of(emptyPaginated<Group>());
      });
      const addError = new Error('boom: addMemberToGroup falló');
      addMemberToGroupFn.mockReturnValueOnce(throwError(() => addError));

      const promise = firstValueFrom(
        service.changeUserRole$({
          uuid: 'target-eperson',
          newRole: 'superadmin',
          newSubdivisionCommunityUuid: null,
        }),
      );

      await expect(promise).rejects.toBe(addError);
      expect(removeMemberFromGroupFn).not.toHaveBeenCalled();
    });
  });

  /** Reset de contraseña: delega al flujo nativo de DSpace (registration forgot). */
  describe('resetPassword$()', () => {
    it('should delegate to EPersonApi.resendRegistration with the given email', async () => {
      await firstValueFrom(service.resetPassword$('mario.garcia@mineduc.gob.gt'));

      expect(resendRegistrationFn).toHaveBeenCalledWith('mario.garcia@mineduc.gob.gt');
    });
  });
});
