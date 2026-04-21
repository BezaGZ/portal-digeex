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
import { Paginated } from '../../../../core/api/models/hal.model';

/**
 * Tests de UserManagementService (lectura). Ensambla UserView combinando
 * 
 * AuthService, GroupApi y DSpaceApi; los wrappers van mockeados porque
 * sus contratos HTTP ya se cubren en sus propios specs. 
 * 
 * Ciclo 10 — Sprint 5.
 * 
 */
describe('UserManagementService — lectura (Ciclo 10)', () => {
  let service: UserManagementService;
  let currentAuthUser: WritableSignal<AuthUser | null>;
  let listEPersonsFn: ReturnType<typeof vi.fn>;
  let getGroupsFn: ReturnType<typeof vi.fn>;
  let getCommunityFn: ReturnType<typeof vi.fn>;

  /** Construye un EPerson con la forma canónica del contrato REST de DSpace. */
  function buildEPerson(input: {
    uuid: string;
    email: string;
    firstName: string;
    lastName: string;
    canLogIn?: boolean;
    lastActive?: string | null;
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
    getGroupsFn = vi.fn().mockReturnValue(of(emptyPaginated<Group>()));
    getCommunityFn = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        UserManagementService,
        { provide: AuthService, useValue: { currentUser: currentAuthUser } },
        { provide: EPersonApiService, useValue: { list: listEPersonsFn } },
        { provide: GroupApiService, useValue: { getGroupsOfEPerson: getGroupsFn } },
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
      expect(getGroupsFn).not.toHaveBeenCalled();
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
      getGroupsFn.mockReturnValue(of(paginated<Group>([administratorGroup])));

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
      expect(getGroupsFn).toHaveBeenCalledWith('eperson-super');
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
      getGroupsFn.mockReturnValue(of(paginated<Group>([adminGroupEducacionBasica])));
      getCommunityFn.mockReturnValue(of(communityEducacionBasica));

      const result = await firstValueFrom(service.currentUserView$);

      expect(result?.role).toBe('admin_subdireccion');
      expect(result?.subdivision).toBe('Educación Básica');
      expect(getCommunityFn).toHaveBeenCalledWith('community-educacion-basica');
    });
  });

  /** Listado paginado según el alcance del caller (superadmin ve todo, admin ve su subdivisión). */
  describe('getVisibleUsers$()', () => {
    /** La paginación se delega tal cual al wrapper HTTP. */
    it('should call EPersonApi.list with the provided size and page params', async () => {
      currentAuthUser.set({
        uuid: 'eperson-super',
        email: 'carlos.ramirez@mineduc.gob.gt',
        firstName: 'Carlos',
        lastName: 'Ramírez',
      });
      getGroupsFn.mockReturnValue(of(paginated<Group>([administratorGroup])));

      await firstValueFrom(service.getVisibleUsers$({ size: 50, page: 2 }));

      expect(listEPersonsFn).toHaveBeenCalledWith({ size: 50, page: 2 });
    });

    /** Cada EPerson se mapea con rol/subdivisión; los metadatos de paginación se preservan. */
    it('should emit Paginated<UserView> with role and subdivision resolved per eperson', async () => {
      currentAuthUser.set({
        uuid: 'eperson-super',
        email: 'carlos.ramirez@mineduc.gob.gt',
        firstName: 'Carlos',
        lastName: 'Ramírez',
      });
      const mario = buildEPerson({
        uuid: 'eperson-mario',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      getGroupsFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-super') return of(paginated<Group>([administratorGroup]));
        if (uuid === 'eperson-mario') return of(paginated<Group>([adminGroupEducacionBasica]));
        return of(emptyPaginated<Group>());
      });
      getCommunityFn.mockImplementation((uuid: string) => {
        if (uuid === 'community-educacion-basica') return of(communityEducacionBasica);
        return of(undefined);
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
      const mario = buildEPerson({
        uuid: 'eperson-mario',
        email: 'mario.garcia@mineduc.gob.gt',
        firstName: 'Mario',
        lastName: 'García',
      });
      const lucia = buildEPerson({
        uuid: 'eperson-lucia',
        email: 'lucia.mendez@mineduc.gob.gt',
        firstName: 'Lucía',
        lastName: 'Méndez',
      });
      const rosa = buildEPerson({
        uuid: 'eperson-rosa',
        email: 'rosa.juarez@mineduc.gob.gt',
        firstName: 'Rosa',
        lastName: 'Juárez',
      });
      getGroupsFn.mockImplementation((uuid: string) => {
        if (uuid === 'eperson-admin-eb' || uuid === 'eperson-mario' || uuid === 'eperson-rosa') {
          return of(paginated<Group>([adminGroupEducacionBasica]));
        }
        if (uuid === 'eperson-lucia') {
          return of(paginated<Group>([adminGroupTrabajoCultura]));
        }
        return of(emptyPaginated<Group>());
      });
      getCommunityFn.mockImplementation((uuid: string) => {
        if (uuid === 'community-educacion-basica') return of(communityEducacionBasica);
        if (uuid === 'community-trabajo-cultura') return of(communityTrabajoCultura);
        return of(undefined);
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
