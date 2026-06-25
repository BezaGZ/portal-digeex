import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { firstValueFrom, of, throwError } from 'rxjs';

import { UserManagementService } from './user-management.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { EPersonApiService } from '../../../../core/api/eperson-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { AuthUser } from '../../../../core/auth/models/auth-session.model';
import { EPerson } from '../../../../core/api/models/eperson.model';
import { Group } from '../../../../core/api/models/group.model';
import { HalListResponse, Paginated } from '../../../../core/api/models/hal.model';

/**
 * Tests de `UserManagementService`.
 *
 * Facade de usuarios administrativos alineado al patrón de `dspace-angular`:
 * alta = POST `/epersons` → POST `text/uri-list` a `/groups/{groupUuid}/epersons`
 * → POST `/registrations`, con rollback si la asignación al grupo falla. Cambio
 * de rol = add al grupo nuevo antes de remove de los previos. Resolución de rol
 * por nombre del grupo (Administrator, ADMIN_*, SUBMITTERS_*) porque el link HAL
 * `_links.object` no apunta al DSO dueño en DSpace 9.2 para grupos custom.
 *
 * Ciclos 10, 11, 13, 17 TDD — Sprint 5. Ajustado en Ciclo 35 (Sprint 8).
 */
describe('UserManagementService', () => {
  let service: UserManagementService;
  let currentAuthUser: WritableSignal<AuthUser | null>;
  let currentEPersonSignal: WritableSignal<EPerson | null>;
  let listEPersonsFn: ReturnType<typeof vi.fn>;
  let getOneEPersonFn: ReturnType<typeof vi.fn>;
  let createEPersonFn: ReturnType<typeof vi.fn>;
  let deleteEPersonFn: ReturnType<typeof vi.fn>;
  let setActiveEPersonFn: ReturnType<typeof vi.fn>;
  let updateEPersonFn: ReturnType<typeof vi.fn>;
  let resendRegistrationFn: ReturnType<typeof vi.fn>;
  let searchByEmailFn: ReturnType<typeof vi.fn>;
  let getGroupsOfEPersonFn: ReturnType<typeof vi.fn>;
  let addMemberToGroupFn: ReturnType<typeof vi.fn>;
  let removeMemberFromGroupFn: ReturnType<typeof vi.fn>;
  let getMembersOfGroupFn: ReturnType<typeof vi.fn>;
  let findAdministratorGroupFn: ReturnType<typeof vi.fn>;
  let listGroupsFn: ReturnType<typeof vi.fn>;

  function buildGroup(name: string, uuid?: string): Group {
    return {
      uuid: uuid ?? `group-${name.toLowerCase()}`,
      name,
      permanent: name === 'Administrator',
      type: 'group',
      _links: {
        self: { href: `/server/api/eperson/groups/${uuid ?? name}` },
        object: { href: '' },
        epersons: { href: '' },
        subgroups: { href: '' },
      },
    };
  }

  const adminGlobal = buildGroup('Administrator', 'group-administrator');
  const adminBasica = buildGroup('ADMIN_ED_BASICA', 'group-admin-basica');
  const submitBasica = buildGroup('SUBMITTERS_ED_BASICA', 'group-submit-basica');
  const adminTrabajo = buildGroup('ADMIN_ED_TRABAJO', 'group-admin-trabajo');
  const anonymous = buildGroup('Anonymous', 'group-anonymous');

  function embeddedGroups(groups: Group[]): HalListResponse<Group> {
    return {
      _embedded: { groups },
      _links: { self: { href: '' } },
      page: { size: groups.length, totalElements: groups.length, totalPages: 1, number: 0 },
    };
  }

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
          {
            value: input.firstName ?? 'N',
            language: null,
            authority: '',
            confidence: -1,
            place: 0,
          },
        ],
        'eperson.lastname': [
          { value: input.lastName ?? 'N', language: null, authority: '', confidence: -1, place: 0 },
        ],
      },
      _embedded: input.groups ? { groups: embeddedGroups(input.groups) } : undefined,
    };
  }

  function paginated<T>(items: T[]): Paginated<T> {
    return { items, totalElements: items.length, totalPages: 1, size: items.length, page: 0 };
  }

  function empty<T>(): Paginated<T> {
    return { items: [], totalElements: 0, totalPages: 0, size: 0, page: 0 };
  }

  /**
   * Construye el EPerson del caller con los grupos embebidos que el facade
   * espera leer desde `AuthService.currentEPerson`. Centraliza el shape
   * para que los tests que cambian el rol del caller solo cambien los grupos.
   */
  function buildCallerEPerson(groups: Group[] = [adminGlobal]): EPerson {
    return buildEPerson({
      uuid: 'uuid-caller',
      email: 'caller@mineduc.gob.gt',
      firstName: 'Carlos',
      lastName: 'Ramírez',
      groups,
    });
  }

  beforeEach(() => {
    currentAuthUser = signal<AuthUser | null>({
      uuid: 'uuid-caller',
      email: 'caller@mineduc.gob.gt',
      firstName: 'Carlos',
      lastName: 'Ramírez',
    });
    currentEPersonSignal = signal<EPerson | null>(buildCallerEPerson());

    getOneEPersonFn = vi.fn();
    getGroupsOfEPersonFn = vi.fn().mockReturnValue(of(empty<Group>()));

    listEPersonsFn = vi.fn().mockReturnValue(of(empty<EPerson>()));
    createEPersonFn = vi.fn();
    deleteEPersonFn = vi.fn().mockReturnValue(of(undefined));
    setActiveEPersonFn = vi.fn();
    updateEPersonFn = vi.fn();
    resendRegistrationFn = vi.fn().mockReturnValue(of(undefined));
    searchByEmailFn = vi.fn().mockReturnValue(of(null));

    addMemberToGroupFn = vi.fn().mockReturnValue(of(adminGlobal));
    removeMemberFromGroupFn = vi.fn().mockReturnValue(of(undefined));
    getMembersOfGroupFn = vi.fn().mockReturnValue(
      of(paginated([buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' })])),
    );
    findAdministratorGroupFn = vi.fn().mockReturnValue(of(adminGlobal));
    listGroupsFn = vi.fn().mockReturnValue(
      of(paginated([adminGlobal, adminBasica, submitBasica, adminTrabajo, anonymous])),
    );

    TestBed.configureTestingModule({
      providers: [
        UserManagementService,
        {
          provide: AuthService,
          useValue: { currentUser: currentAuthUser, currentEPerson: currentEPersonSignal },
        },
        {
          provide: EPersonApiService,
          useValue: {
            list: listEPersonsFn,
            getOne: getOneEPersonFn,
            create: createEPersonFn,
            delete: deleteEPersonFn,
            setActive: setActiveEPersonFn,
            update: updateEPersonFn,
            resendRegistration: resendRegistrationFn,
            searchByEmail: searchByEmailFn,
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
            listGroups: listGroupsFn,
          },
        },
      ],
    });

    service = TestBed.inject(UserManagementService);
  });

  describe('resolveCallerSnapshot', () => {
    /** Verifica que el snapshot devuelva el caller superadmin (grupo Administrator), sin subdivisión. */
    it('should return the superadmin caller from the live EPerson', () => {
      expect(service.resolveCallerSnapshot()).toEqual({ role: 'superadmin', sufijo: null });
    });

    /** Verifica que el snapshot devuelva el admin de subdirección con su sufijo. */
    it('should return the admin_subdireccion caller with its suffix', () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      expect(service.resolveCallerSnapshot()).toEqual({ role: 'admin_subdireccion', sufijo: 'ED_BASICA' });
    });

    /** Verifica que el snapshot sea null cuando el EPerson no tiene grupo de rol del portal. */
    it('should return null when the EPerson has no portal role group', () => {
      currentEPersonSignal.set(buildCallerEPerson([]));
      expect(service.resolveCallerSnapshot()).toBeNull();
    });

    /** Verifica que el snapshot sea null cuando no hay EPerson en sesión. */
    it('should return null when there is no current EPerson', () => {
      currentEPersonSignal.set(null);
      expect(service.resolveCallerSnapshot()).toBeNull();
    });

    /**
     * Verifica que el snapshot resuelva el EPerson actual (X) aunque
     * `currentUserView$` haya quedado caliente con un usuario previo (Y).
     */
    it('should reflect the current EPerson even after currentUserView$ was warmed with a previous user', async () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      expect(await firstValueFrom(service.currentUserView$)).not.toBeNull();

      currentEPersonSignal.set(buildCallerEPerson([adminGlobal]));

      expect(service.resolveCallerSnapshot()).toEqual({ role: 'superadmin', sufijo: null });
    });
  });

  describe('currentUserView$', () => {
    /** Verifica que sin EPerson cacheado el observable emita null. */
    it('should emit null when the cached EPerson is null', async () => {
      currentEPersonSignal.set(null);
      expect(await firstValueFrom(service.currentUserView$)).toBeNull();
    });

    /** Verifica que un caller miembro de Administrator emita UserView con role=superadmin y sin subdivisión. */
    it('should emit a UserView with role=superadmin when the caller belongs to Administrator', async () => {
      const view = await firstValueFrom(service.currentUserView$);
      expect(view?.role).toBe('superadmin');
      expect(view?.subdivision).toBeNull();
    });

    /** Verifica que un caller miembro de ADMIN_ED_BASICA reporte admin_subdireccion con subdivision=ED_BASICA. */
    it('should emit a UserView with role=admin_subdireccion and the suffix as subdivision', async () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      const view = await firstValueFrom(service.currentUserView$);
      expect(view?.role).toBe('admin_subdireccion');
      expect(view?.subdivision).toBe('ED_BASICA');
    });

    /**
     * Asegura la optimización que motivó este refactor: `currentUserView$`
     * resuelve sin pegarle a `EPersonApi.getOne` ni a `GroupApi.getGroupsOfEPerson`
     * porque el EPerson con grupos ya viene cacheado por `AuthService`.
     */
    it('should not call EPersonApi.getOne or GroupApi.getGroupsOfEPerson when resolving the caller view', async () => {
      await firstValueFrom(service.currentUserView$);
      expect(getOneEPersonFn).not.toHaveBeenCalled();
      expect(getGroupsOfEPersonFn).not.toHaveBeenCalled();
    });
  });

  /**
   * searchUsers$ alinea al patrón `EPeopleRegistryComponent` de dspace-angular:
   * la decisión de endpoint depende del scope (`metadata` | `email`) y de si
   * la query está vacía. El container consume la misma forma paginada para
   * alimentar el `p-table` en modo lazy.
   */
  describe('searchUsers$()', () => {
    /** Verifica que query vacía siempre caiga al listado base, sin tocar search/byMetadata. */
    it('should call EPersonApi.list with page, size and embed=groups when the query is empty', async () => {
      await firstValueFrom(
        service.searchUsers$({ scope: 'metadata', query: '', page: 2, size: 25 }),
      );
      expect(listEPersonsFn).toHaveBeenCalledWith({ page: 2, size: 25, embed: 'groups' });
    });

    /** Verifica que scope=metadata con query no vacía pegue a search/byMetadata preservando página y size. */
    it('should call EPersonApi.searchByMetadata when scope=metadata and query is not empty', async () => {
      const searchByMetadataFn = vi.fn().mockReturnValue(of(empty<EPerson>()));
      (service['epersonApi'] as unknown as { searchByMetadata: typeof searchByMetadataFn }).searchByMetadata =
        searchByMetadataFn;

      await firstValueFrom(
        service.searchUsers$({ scope: 'metadata', query: 'carlos', page: 1, size: 10 }),
      );

      expect(searchByMetadataFn).toHaveBeenCalledWith({
        query: 'carlos',
        page: 1,
        size: 10,
        embed: 'groups',
      });
    });

    /** Verifica que query con espacios alrededor se trimee antes de decidir branch. */
    it('should trim the query and fall back to list when it is whitespace-only', async () => {
      await firstValueFrom(
        service.searchUsers$({ scope: 'metadata', query: '   ', page: 0, size: 10 }),
      );
      expect(listEPersonsFn).toHaveBeenCalledWith({ page: 0, size: 10, embed: 'groups' });
    });

    /**
     * Verifica que scope=email con query pegue a search/byEmail con embed y
     * envuelva el eperson solitario como un Paginated de un elemento para
     * que el p-table consuma siempre la misma forma.
     */
    it('should call EPersonApi.searchByEmail and wrap the result as a single-item Paginated when scope=email', async () => {
      const eperson = buildEPerson({
        uuid: 'uuid-found',
        email: 'encontrado@mineduc.gob.gt',
        groups: [submitBasica],
      });
      searchByEmailFn.mockReturnValue(of(eperson));

      const result = await firstValueFrom(
        service.searchUsers$({ scope: 'email', query: 'encontrado@mineduc.gob.gt', page: 0, size: 10 }),
      );

      expect(searchByEmailFn).toHaveBeenCalledWith('encontrado@mineduc.gob.gt', { embed: 'groups' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].uuid).toBe('uuid-found');
      expect(result.totalElements).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    /**
     * Verifica que un eperson sin grupo de rol entre al listado con role=null.
     * Filtrarlo lo dejaba irreparable desde la tabla y desalineaba el totalElements.
     */
    it('should include epersons without portal role groups as role=null entries', async () => {
      const orphan = buildEPerson({
        uuid: 'uuid-orphan',
        email: 'orfano@mineduc.gob.gt',
        groups: [],
      });
      listEPersonsFn.mockReturnValue(of(paginated([orphan])));

      const result = await firstValueFrom(
        service.searchUsers$({ scope: 'metadata', query: '', page: 0, size: 10 }),
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].role).toBeNull();
      expect(result.items[0].subdivision).toBeNull();
    });

    /** Verifica que scope=email sin match devuelva un Paginated vacío (no error). */
    it('should return an empty Paginated when scope=email and no match is found', async () => {
      searchByEmailFn.mockReturnValue(of(null));

      const result = await firstValueFrom(
        service.searchUsers$({ scope: 'email', query: 'inexistente@mineduc.gob.gt', page: 0, size: 10 }),
      );

      expect(result.items).toEqual([]);
      expect(result.totalElements).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('getAssignableGroups$()', () => {
    /** Verifica que getAssignableGroups$ devuelva solo grupos del portal y descarte Anonymous y nativos. */
    it('should expose only portal role groups, filtering Anonymous and other native groups', async () => {
      const groups = await firstValueFrom(service.getAssignableGroups$());
      const names = groups.map((g) => g.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'Administrator',
          'ADMIN_ED_BASICA',
          'ADMIN_ED_TRABAJO',
          'SUBMITTERS_ED_BASICA',
        ]),
      );
      expect(names).not.toContain('Anonymous');
    });

    /**
     * Verifica que cuando el backend paginate los grupos en más de una página,
     * el facade pida todas en paralelo y concatene antes de filtrar, para no
     * perder grupos del portal que queden en páginas posteriores.
     */
    it('should fetch every groups page in parallel when totalPages > 1', async () => {
      const firstPage = {
        items: [buildGroup('Administrator', 'group-administrator')],
        totalElements: 2,
        totalPages: 2,
        size: 1,
        page: 0,
      };
      const secondPage = {
        items: [buildGroup('ADMIN_ED_ALFABETIZACION', 'group-alfa')],
        totalElements: 2,
        totalPages: 2,
        size: 1,
        page: 1,
      };
      listGroupsFn.mockImplementation((opts: { page?: number }) => {
        if (opts?.page === 0) return of(firstPage);
        if (opts?.page === 1) return of(secondPage);
        return of(empty<Group>());
      });

      const groups = await firstValueFrom(service.getAssignableGroups$());
      const names = groups.map((g) => g.name).sort();

      expect(listGroupsFn).toHaveBeenCalledWith({ size: 100, page: 0 });
      expect(listGroupsFn).toHaveBeenCalledWith({ size: 100, page: 1 });
      expect(names).toEqual(['ADMIN_ED_ALFABETIZACION', 'Administrator']);
    });
  });

  describe('createUser$()', () => {
    const baseInput = {
      email: 'nuevo@mineduc.gob.gt',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      targetGroup: { uuid: submitBasica.uuid, name: submitBasica.name },
    };

    /** Verifica que un correo sin el dominio institucional (RN-02) se bloquee antes de tocar el backend. */
    it('should reject with BusinessRuleError EMAIL_INVALID when email does not end in @mineduc.gob.gt', async () => {
      await expect(
        firstValueFrom(service.createUser$({ ...baseInput, email: 'x@gmail.com' })),
      ).rejects.toMatchObject({ code: 'EMAIL_INVALID' });
    });

    /**
     * Verifica que un correo ya registrado (RN-10) se bloquee antes del POST.
     * DSpace devuelve 500 genérico en ese caso; el pre-check por byEmail convierte
     * esa condición en DUPLICATE_EMAIL sin romper el flujo con una exception ajena.
     */
    it('should reject with BusinessRuleError DUPLICATE_EMAIL when searchByEmail returns an existing eperson', async () => {
      searchByEmailFn.mockReturnValue(
        of(buildEPerson({ uuid: 'uuid-existing', email: baseInput.email })),
      );

      await expect(firstValueFrom(service.createUser$(baseInput))).rejects.toMatchObject({
        code: 'DUPLICATE_EMAIL',
      });
      expect(createEPersonFn).not.toHaveBeenCalled();
    });

    /** Verifica la secuencia transaccional: POST eperson → addMemberToGroup → resendRegistration sin rollback. */
    it('should POST eperson, add it to the target group and trigger registration email', async () => {
      const created = buildEPerson({ uuid: 'uuid-new', email: baseInput.email });
      createEPersonFn.mockReturnValue(of(created));

      await firstValueFrom(service.createUser$(baseInput));

      expect(createEPersonFn).toHaveBeenCalledWith({
        email: baseInput.email,
        firstName: baseInput.firstName,
        lastName: baseInput.lastName,
      });
      expect(addMemberToGroupFn).toHaveBeenCalledWith(submitBasica.uuid, 'uuid-new');
      expect(resendRegistrationFn).toHaveBeenCalledWith(baseInput.email);
      expect(deleteEPersonFn).not.toHaveBeenCalled();
    });

    /** Verifica que el fallo de addMemberToGroup dispare delete del eperson recién creado. */
    it('should rollback the created eperson when addMemberToGroup fails', async () => {
      const created = buildEPerson({ uuid: 'uuid-new', email: baseInput.email });
      createEPersonFn.mockReturnValue(of(created));
      const groupError = new Error('add falló');
      addMemberToGroupFn.mockReturnValueOnce(throwError(() => groupError));

      await expect(firstValueFrom(service.createUser$(baseInput))).rejects.toBe(groupError);
      expect(deleteEPersonFn).toHaveBeenCalledWith('uuid-new');
      expect(resendRegistrationFn).not.toHaveBeenCalled();
    });

    /** Verifica que admin_subdireccion no pueda crear usuarios en otra subdivisión (RN-08). */
    it('should reject INSUFFICIENT_PRIVILEGES when admin_subdireccion targets a group outside its subdivision', async () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      const input = {
        ...baseInput,
        targetGroup: { uuid: 'uuid-otro', name: 'SUBMITTERS_ED_TRABAJO' },
      };

      await expect(firstValueFrom(service.createUser$(input))).rejects.toMatchObject({
        code: 'INSUFFICIENT_PRIVILEGES',
      });
      expect(createEPersonFn).not.toHaveBeenCalled();
    });

    /** Verifica que admin_subdireccion solo pueda asignar grupos SUBMITTERS_* (RN-13). */
    it('should reject INSUFFICIENT_PRIVILEGES when admin_subdireccion targets a non-SUBMITTERS_ group', async () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      const input = {
        ...baseInput,
        targetGroup: { uuid: adminBasica.uuid, name: 'ADMIN_ED_BASICA' },
      };

      await expect(firstValueFrom(service.createUser$(input))).rejects.toMatchObject({
        code: 'INSUFFICIENT_PRIVILEGES',
      });
    });
  });

  describe('deactivateUser$()', () => {
    /** Verifica que un caller no pueda desactivarse a sí mismo (RN-12). */
    it('should reject SELF_DEACTIVATE when the target is the caller itself', async () => {
      await expect(firstValueFrom(service.deactivateUser$('uuid-caller'))).rejects.toMatchObject({
        code: 'SELF_DEACTIVATE',
      });
    });

    /** Verifica que el último superadmin activo no se pueda desactivar (RN-11). */
    it('should reject LAST_SUPERADMIN when target is the only active admin', async () => {
      getMembersOfGroupFn.mockReturnValue(
        of(
          paginated([
            buildEPerson({ uuid: 'lonely', email: 'l@mineduc.gob.gt', canLogIn: true }),
          ]),
        ),
      );
      await expect(firstValueFrom(service.deactivateUser$('lonely'))).rejects.toMatchObject({
        code: 'LAST_SUPERADMIN',
      });
    });

    /** Verifica que admin_subdireccion no pueda desactivar usuarios de otra subdivisión (RN-32). */
    it('should reject OUT_OF_SCOPE when caller is admin_subdireccion and target is in another subdivision', async () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-other') return of(paginated([adminTrabajo]));
        return of(empty<Group>());
      });

      await expect(firstValueFrom(service.deactivateUser$('uuid-other'))).rejects.toMatchObject({
        code: 'OUT_OF_SCOPE',
      });
      expect(setActiveEPersonFn).not.toHaveBeenCalled();
    });

    /** Verifica que con los guards en verde la desactivación delegue a EPersonApi.setActive(uuid, false). */
    it('should call EPersonApi.setActive(uuid, false) when guards pass', async () => {
      const updated = buildEPerson({ uuid: 'uuid-t', email: 't@mineduc.gob.gt', canLogIn: false });
      setActiveEPersonFn.mockReturnValue(of(updated));
      getMembersOfGroupFn.mockReturnValue(of(empty<EPerson>()));

      await firstValueFrom(service.deactivateUser$('uuid-t'));
      expect(setActiveEPersonFn).toHaveBeenCalledWith('uuid-t', false);
    });
  });

  describe('reactivateUser$()', () => {
    /** Verifica que la reactivación delegue a EPersonApi.setActive(uuid, true). */
    it('should call EPersonApi.setActive(uuid, true)', async () => {
      setActiveEPersonFn.mockReturnValue(of(buildEPerson({ uuid: 'uuid-t', email: 't@x.com' })));
      await firstValueFrom(service.reactivateUser$('uuid-t'));
      expect(setActiveEPersonFn).toHaveBeenCalledWith('uuid-t', true);
    });
  });

  describe('changeUserRole$()', () => {
    /** Verifica que solo superadmin pueda cambiar roles (RN-13). */
    it('should reject INSUFFICIENT_PRIVILEGES when the caller is not superadmin', async () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      await expect(
        firstValueFrom(
          service.changeUserRole$({
            uuid: 'uuid-t',
            newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
    });

    /** Verifica que el caller no pueda cambiar su propio rol (RN-27). */
    it('should reject SELF_DEACTIVATE when the caller targets itself', async () => {
      await expect(
        firstValueFrom(
          service.changeUserRole$({
            uuid: 'uuid-caller',
            newGroup: { uuid: adminBasica.uuid, name: adminBasica.name },
          }),
        ),
      ).rejects.toMatchObject({ code: 'SELF_DEACTIVATE' });
    });

    /** Verifica que el cambio de rol agregue al grupo nuevo antes de remover de los previos (invariante atómica). */
    it('should add the target to the new group BEFORE removing from the previous role groups', async () => {
      const order: string[] = [];
      addMemberToGroupFn.mockImplementation(() => {
        order.push('add');
        return of(adminTrabajo);
      });
      removeMemberFromGroupFn.mockImplementation(() => {
        order.push('remove');
        return of(undefined);
      });
      const target = buildEPerson({
        uuid: 'uuid-t',
        email: 't@mineduc.gob.gt',
        groups: [adminBasica],
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') {
          return of(buildEPerson({ uuid: 'uuid-caller', email: 'c@mineduc.gob.gt' }));
        }
        return of(target);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') return of(paginated([adminGlobal]));
        return of(paginated([adminBasica]));
      });

      await firstValueFrom(
        service.changeUserRole$({
          uuid: 'uuid-t',
          newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
        }),
      );

      expect(addMemberToGroupFn).toHaveBeenCalledWith(adminTrabajo.uuid, 'uuid-t');
      expect(removeMemberFromGroupFn).toHaveBeenCalledWith(adminBasica.uuid, 'uuid-t');
      expect(order.indexOf('add')).toBeLessThan(order.indexOf('remove'));
    });

    /**
     * Verifica que si una remove falla después del add exitoso, el facade
     * compense quitando al target del grupo nuevo (rollback) para honrar la
     * invariante add-before-remove atómico del Ciclo 13.
     */
    it('should rollback the add when a previous-group remove fails', async () => {
      const target = buildEPerson({
        uuid: 'uuid-t',
        email: 't@mineduc.gob.gt',
        groups: [adminBasica],
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') {
          return of(buildEPerson({ uuid: 'uuid-caller', email: 'c@mineduc.gob.gt' }));
        }
        return of(target);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') return of(paginated([adminGlobal]));
        return of(paginated([adminBasica]));
      });
      removeMemberFromGroupFn.mockImplementation((groupUuid: string) => {
        if (groupUuid === adminBasica.uuid) return throwError(() => new Error('remove failed'));
        return of(undefined);
      });

      await expect(
        firstValueFrom(
          service.changeUserRole$({
            uuid: 'uuid-t',
            newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
          }),
        ),
      ).rejects.toMatchObject({ message: 'remove failed' });

      expect(removeMemberFromGroupFn).toHaveBeenCalledWith(adminTrabajo.uuid, 'uuid-t');
    });

    /**
     * Verifica que todas las removes se disparen en paralelo incluso si
     * alguna falla, cerrando 9.2.8 (el forkJoin previo abortaba las demás
     * ante el primer fallo, dejando estado indeterminado).
     */
    it('should attempt every previous-group remove even when one of them fails', async () => {
      const secondOldGroup = buildGroup('ADMIN_ED_ALFABETIZACION', 'group-admin-alfa');
      const target = buildEPerson({
        uuid: 'uuid-t',
        email: 't@mineduc.gob.gt',
        groups: [adminBasica, secondOldGroup],
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') {
          return of(buildEPerson({ uuid: 'uuid-caller', email: 'c@mineduc.gob.gt' }));
        }
        return of(target);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') return of(paginated([adminGlobal]));
        return of(paginated([adminBasica, secondOldGroup]));
      });
      removeMemberFromGroupFn.mockImplementation((groupUuid: string) => {
        if (groupUuid === adminBasica.uuid) return throwError(() => new Error('remove failed'));
        return of(undefined);
      });

      await expect(
        firstValueFrom(
          service.changeUserRole$({
            uuid: 'uuid-t',
            newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
          }),
        ),
      ).rejects.toMatchObject({ message: 'remove failed' });

      expect(removeMemberFromGroupFn).toHaveBeenCalledWith(adminBasica.uuid, 'uuid-t');
      expect(removeMemberFromGroupFn).toHaveBeenCalledWith(secondOldGroup.uuid, 'uuid-t');
    });

    /**
     * Verifica que si el rollback del add también falla, el caller sigue viendo
     * el error original de la remove fallida (no el error del rollback).
     */
    it('should propagate the original remove error when the rollback itself fails', async () => {
      const target = buildEPerson({
        uuid: 'uuid-t',
        email: 't@mineduc.gob.gt',
        groups: [adminBasica],
      });
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') {
          return of(buildEPerson({ uuid: 'uuid-caller', email: 'c@mineduc.gob.gt' }));
        }
        return of(target);
      });
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') return of(paginated([adminGlobal]));
        return of(paginated([adminBasica]));
      });
      removeMemberFromGroupFn.mockImplementation((groupUuid: string) => {
        if (groupUuid === adminBasica.uuid) return throwError(() => new Error('original remove failed'));
        if (groupUuid === adminTrabajo.uuid) return throwError(() => new Error('rollback failed'));
        return of(undefined);
      });

      await expect(
        firstValueFrom(
          service.changeUserRole$({
            uuid: 'uuid-t',
            newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
          }),
        ),
      ).rejects.toMatchObject({ message: 'original remove failed' });
    });

    /**
     * Cubre la idempotencia de `changeUserRole$`: cuando el target ya pertenece
     * al grupo destino, la operación salta el add y solo limpia los otros
     * grupos de rol.
     */
    describe('self-healing reconciliation', () => {
      /** Verifica que cuando el target ya pertenece al grupo destino, no se llame al add y se limpie el otro grupo de rol. */
      it('should skip the add when the target is already a member of the new group and only clean up the other role groups', async () => {
        const target = buildEPerson({
          uuid: 'uuid-t',
          email: 't@mineduc.gob.gt',
          groups: [adminBasica, adminTrabajo], // residuo de un cambio anterior fallido
        });
        getOneEPersonFn.mockImplementation((uuid: string) => {
          if (uuid === 'uuid-caller') {
            return of(buildEPerson({ uuid: 'uuid-caller', email: 'c@mineduc.gob.gt' }));
          }
          return of(target);
        });
        getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
          if (uuid === 'uuid-caller') return of(paginated([adminGlobal]));
          return of(paginated([adminBasica, adminTrabajo]));
        });

        await firstValueFrom(
          service.changeUserRole$({
            uuid: 'uuid-t',
            newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
          }),
        );

        // add NO debe dispararse: el target ya pertenece al grupo destino,
        // así que no hay nada que agregar. Llamarlo arriesga 422 de DSpace
        // por duplicate membership y rompería la idempotencia.
        expect(addMemberToGroupFn).not.toHaveBeenCalledWith(adminTrabajo.uuid, 'uuid-t');
        // remove SÍ debe limpiar el grupo residual.
        expect(removeMemberFromGroupFn).toHaveBeenCalledWith(adminBasica.uuid, 'uuid-t');
      });

      /** Verifica que cuando el target tiene varios grupos de rol asignados, todos se limpian salvo el destino. */
      it('should clean up every residual portal role group except the new one', async () => {
        const adminAlfa = buildGroup('ADMIN_ED_ALFABETIZACION', 'group-admin-alfa');
        const target = buildEPerson({
          uuid: 'uuid-t',
          email: 't@mineduc.gob.gt',
          groups: [adminBasica, adminTrabajo, adminAlfa, submitBasica], // 4 grupos de rol residuales
        });
        getOneEPersonFn.mockImplementation((uuid: string) => {
          if (uuid === 'uuid-caller') {
            return of(buildEPerson({ uuid: 'uuid-caller', email: 'c@mineduc.gob.gt' }));
          }
          return of(target);
        });
        getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
          if (uuid === 'uuid-caller') return of(paginated([adminGlobal]));
          return of(paginated([adminBasica, adminTrabajo, adminAlfa, submitBasica]));
        });

        await firstValueFrom(
          service.changeUserRole$({
            uuid: 'uuid-t',
            newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
          }),
        );

        // Los 3 grupos residuales (adminBasica, adminAlfa, submitBasica) deben removerse.
        expect(removeMemberFromGroupFn).toHaveBeenCalledWith(adminBasica.uuid, 'uuid-t');
        expect(removeMemberFromGroupFn).toHaveBeenCalledWith(adminAlfa.uuid, 'uuid-t');
        expect(removeMemberFromGroupFn).toHaveBeenCalledWith(submitBasica.uuid, 'uuid-t');
        // El grupo destino NO se debe remover.
        expect(removeMemberFromGroupFn).not.toHaveBeenCalledWith(adminTrabajo.uuid, 'uuid-t');
      });

      /** Verifica que si el add se saltó y una remove falla, el rollback no remueva el grupo destino. */
      it('should NOT trigger the add rollback when the add was skipped and a remove fails', async () => {
        const target = buildEPerson({
          uuid: 'uuid-t',
          email: 't@mineduc.gob.gt',
          groups: [adminBasica, adminTrabajo],
        });
        getOneEPersonFn.mockImplementation((uuid: string) => {
          if (uuid === 'uuid-caller') {
            return of(buildEPerson({ uuid: 'uuid-caller', email: 'c@mineduc.gob.gt' }));
          }
          return of(target);
        });
        getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
          if (uuid === 'uuid-caller') return of(paginated([adminGlobal]));
          return of(paginated([adminBasica, adminTrabajo]));
        });
        removeMemberFromGroupFn.mockImplementation((groupUuid: string) => {
          if (groupUuid === adminBasica.uuid) {
            return throwError(() => new Error('remove failed'));
          }
          return of(undefined);
        });

        await expect(
          firstValueFrom(
            service.changeUserRole$({
              uuid: 'uuid-t',
              newGroup: { uuid: adminTrabajo.uuid, name: adminTrabajo.name },
            }),
          ),
        ).rejects.toMatchObject({ message: 'remove failed' });

        // Nunca debe llamarse remove sobre adminTrabajo: el add se saltó, así
        // que el rollback no aplica. Si el código viejo intentara remover el
        // grupo destino como rollback, dejaría al target SIN ningún rol.
        expect(removeMemberFromGroupFn).not.toHaveBeenCalledWith(adminTrabajo.uuid, 'uuid-t');
      });
    });
  });

  describe('resetPassword$()', () => {
    /** Verifica que el caller no pueda reenviarse su propio reset desde el panel (RN-31). */
    it('should reject SELF_RESET when the caller targets its own uuid', async () => {
      await expect(
        firstValueFrom(
          service.resetPassword$({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' }),
        ),
      ).rejects.toMatchObject({ code: 'SELF_RESET' });
    });

    /** Verifica que admin_subdireccion no pueda resetear contraseña fuera de su subdivisión (RN-32). */
    it('should reject OUT_OF_SCOPE when admin_subdireccion targets another subdivision', async () => {
      currentEPersonSignal.set(buildCallerEPerson([adminBasica]));
      getGroupsOfEPersonFn.mockReturnValue(of(paginated([adminTrabajo])));

      await expect(
        firstValueFrom(service.resetPassword$({ uuid: 'uuid-t', email: 't@mineduc.gob.gt' })),
      ).rejects.toMatchObject({ code: 'OUT_OF_SCOPE' });
      expect(resendRegistrationFn).not.toHaveBeenCalled();
    });

    /** Verifica que con los guards en verde el reset delegue al endpoint nativo de DSpace con el email. */
    it('should delegate to resendRegistration with the target email when guards pass', async () => {
      await firstValueFrom(
        service.resetPassword$({ uuid: 'uuid-t', email: 't@mineduc.gob.gt' }),
      );
      expect(resendRegistrationFn).toHaveBeenCalledWith('t@mineduc.gob.gt');
    });
  });

  /**
   * updateUser$ cubre RN-30: edición diff de firstName/lastName/email. Solo los
   * campos que cambiaron se mandan al PATCH. Si el correo cambia y el target
   * nunca activó (lastActive null), se reenvía el registration al correo nuevo
   * para que el link llegue al buzón correcto. EMAIL_INVALID y DUPLICATE_EMAIL
   * se gestionan como el resto de mutaciones del facade.
   */
  describe('updateUser$()', () => {
    const targetUuid = 'uuid-target';

    function targetEPerson(overrides: { lastActive?: string | null; canLogIn?: boolean } = {}): EPerson {
      return {
        ...buildEPerson({
          uuid: targetUuid,
          email: 'target@mineduc.gob.gt',
          firstName: 'Rosa',
          lastName: 'Juárez',
          groups: [submitBasica],
        }),
        lastActive: overrides.lastActive !== undefined ? overrides.lastActive : null,
        canLogIn: overrides.canLogIn ?? true,
      };
    }

    /** Verifica que solo firstName en el diff dispare un PATCH con ese único campo. */
    it('should call EPersonApi.update with only firstName when only firstName changed', async () => {
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === targetUuid) return of(targetEPerson({ lastActive: '2026-03-15' }));
        return of(buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' }));
      });
      updateEPersonFn.mockReturnValue(of(targetEPerson({ lastActive: '2026-03-15' })));

      await firstValueFrom(
        service.updateUser$({ uuid: targetUuid, changes: { firstName: 'Rosa María' } }),
      );

      expect(updateEPersonFn).toHaveBeenCalledWith(targetUuid, { firstName: 'Rosa María' });
      expect(resendRegistrationFn).not.toHaveBeenCalled();
    });

    /** Verifica que solo lastName en el diff dispare un PATCH con ese único campo. */
    it('should call EPersonApi.update with only lastName when only lastName changed', async () => {
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === targetUuid) return of(targetEPerson({ lastActive: '2026-03-15' }));
        return of(buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' }));
      });
      updateEPersonFn.mockReturnValue(of(targetEPerson({ lastActive: '2026-03-15' })));

      await firstValueFrom(
        service.updateUser$({ uuid: targetUuid, changes: { lastName: 'Juárez López' } }),
      );

      expect(updateEPersonFn).toHaveBeenCalledWith(targetUuid, { lastName: 'Juárez López' });
      expect(resendRegistrationFn).not.toHaveBeenCalled();
    });

    /**
     * Verifica que cambiar el correo de un usuario que nunca activó dispare
     * PATCH de email y acto seguido un resendRegistration al correo nuevo.
     */
    it('should call EPersonApi.update with email and trigger resendRegistration when target never activated', async () => {
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === targetUuid) return of(targetEPerson({ lastActive: null }));
        return of(buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' }));
      });
      updateEPersonFn.mockReturnValue(of(targetEPerson({ lastActive: null })));

      await firstValueFrom(
        service.updateUser$({
          uuid: targetUuid,
          changes: { email: 'nuevo@mineduc.gob.gt' },
        }),
      );

      expect(updateEPersonFn).toHaveBeenCalledWith(targetUuid, { email: 'nuevo@mineduc.gob.gt' });
      expect(resendRegistrationFn).toHaveBeenCalledWith('nuevo@mineduc.gob.gt');
    });

    /**
     * Verifica que cambiar el correo de un usuario que ya activó no dispare
     * resendRegistration: el target ya tiene contraseña y no queremos resetearla.
     */
    it('should NOT trigger resendRegistration when email changes but target already activated', async () => {
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === targetUuid) return of(targetEPerson({ lastActive: '2026-03-15' }));
        return of(buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' }));
      });
      updateEPersonFn.mockReturnValue(of(targetEPerson({ lastActive: '2026-03-15' })));

      await firstValueFrom(
        service.updateUser$({
          uuid: targetUuid,
          changes: { email: 'nuevo@mineduc.gob.gt' },
        }),
      );

      expect(updateEPersonFn).toHaveBeenCalledWith(targetUuid, { email: 'nuevo@mineduc.gob.gt' });
      expect(resendRegistrationFn).not.toHaveBeenCalled();
    });

    /** Verifica que un correo fuera del dominio institucional se corte con EMAIL_INVALID. */
    it('should reject with EMAIL_INVALID when the new email does not end with @mineduc.gob.gt', async () => {
      await expect(
        firstValueFrom(
          service.updateUser$({
            uuid: targetUuid,
            changes: { email: 'personal@gmail.com' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'EMAIL_INVALID' });

      expect(updateEPersonFn).not.toHaveBeenCalled();
      expect(resendRegistrationFn).not.toHaveBeenCalled();
    });

    /**
     * Verifica que el pre-check vía searchByEmail bloquee el PATCH cuando el
     * correo nuevo ya pertenece a otro usuario. Evita el roundtrip innecesario
     * al backend y deja al caller con un toast consistente.
     */
    it('should reject DUPLICATE_EMAIL from the searchByEmail pre-check without firing the PATCH', async () => {
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === targetUuid) return of(targetEPerson({ lastActive: '2026-03-15' }));
        return of(buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' }));
      });
      searchByEmailFn.mockReturnValue(
        of(buildEPerson({ uuid: 'uuid-other', email: 'duplicado@mineduc.gob.gt' })),
      );

      await expect(
        firstValueFrom(
          service.updateUser$({
            uuid: targetUuid,
            changes: { email: 'duplicado@mineduc.gob.gt' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });

      expect(searchByEmailFn).toHaveBeenCalledWith('duplicado@mineduc.gob.gt');
      expect(updateEPersonFn).not.toHaveBeenCalled();
    });

    /**
     * Verifica que si el pre-check no pudo bloquear (p. ej. admin_subdireccion
     * sin permiso sobre searchByEmail devuelve null y se traga el 403) y DSpace
     * responde 422 por unicidad del correo, el post-check traduce el error a
     * DUPLICATE_EMAIL para que el toast salga igual que en el alta.
     */
    it('should map a 422 duplicate-email response from DSpace to DUPLICATE_EMAIL', async () => {
      getOneEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === targetUuid) return of(targetEPerson({ lastActive: '2026-03-15' }));
        return of(buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' }));
      });
      searchByEmailFn.mockReturnValue(of(null));
      updateEPersonFn.mockReturnValue(
        throwError(() => ({ status: 422, error: { message: 'Email already taken' } })),
      );

      await expect(
        firstValueFrom(
          service.updateUser$({
            uuid: targetUuid,
            changes: { email: 'duplicado@mineduc.gob.gt' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });
    });
  });
});
