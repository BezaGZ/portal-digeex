import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';

import { UserManagementService } from './user-management.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { EPersonApiService } from '../../../../core/api/eperson-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { DSpaceApiService } from '../../../../core/api/dspace-api.service';
import { AuthUser } from '../../../../core/auth/models/auth-session.model';
import { EPerson } from '../../../../core/api/models/eperson.model';
import { Group } from '../../../../core/api/models/group.model';
import { Community } from '../../../../core/api/models/community.model';
import { HalListResponse, Paginated } from '../../../../core/api/models/hal.model';

/**
 * Tests de UserManagementService (lectura). El facade usa la proyección
 * nativa de DSpace `?embed=groups` para evitar N+1: los grupos vienen
 * anidados dentro de cada eperson, y el único recurso externo que queda
 * por resolver por su cuenta es la community (para el nombre legible).
 *
 * Ciclo 10 — Sprint 5.
 */
describe('UserManagementService — lectura (Ciclo 10)', () => {
  let service: UserManagementService;
  let currentAuthUser: WritableSignal<AuthUser | null>;
  let listEPersonsFn: ReturnType<typeof vi.fn>;
  let getOneEPersonFn: ReturnType<typeof vi.fn>;
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
    getCommunityFn = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        UserManagementService,
        { provide: AuthService, useValue: { currentUser: currentAuthUser } },
        {
          provide: EPersonApiService,
          useValue: { list: listEPersonsFn, getOne: getOneEPersonFn },
        },
        // GroupApi queda cableada para Ciclo 11 (mutaciones); en lectura no se usa.
        { provide: GroupApiService, useValue: {} },
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
            groups: [administratorGroup],
          }),
        ),
      );

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
      expect(getOneEPersonFn).toHaveBeenCalledWith('eperson-super', { embed: 'groups' });
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
            groups: [adminGroupEducacionBasica],
          }),
        ),
      );
      getCommunityFn.mockReturnValue(of(communityEducacionBasica));

      const result = await firstValueFrom(service.currentUserView$);

      expect(result?.role).toBe('admin_subdireccion');
      expect(result?.subdivision).toBe('Educación Básica');
      expect(getCommunityFn).toHaveBeenCalledWith('community-educacion-basica');
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
            groups: [administratorGroup],
          }),
        ),
      );

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
            groups: [administratorGroup],
          }),
        ),
      );
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
            groups: [adminGroupEducacionBasica],
          }),
        ),
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
  });
});
