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
 * Ciclos 10, 11, 13, 17 TDD — Sprint 5.
 */
describe('UserManagementService', () => {
  let service: UserManagementService;
  let currentAuthUser: WritableSignal<AuthUser | null>;
  let listEPersonsFn: ReturnType<typeof vi.fn>;
  let getOneEPersonFn: ReturnType<typeof vi.fn>;
  let createEPersonFn: ReturnType<typeof vi.fn>;
  let deleteEPersonFn: ReturnType<typeof vi.fn>;
  let setActiveEPersonFn: ReturnType<typeof vi.fn>;
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
          },
        ],
        'eperson.lastname': [
          { value: input.lastName ?? 'N', language: null, authority: '', confidence: -1 },
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

  beforeEach(() => {
    currentAuthUser = signal<AuthUser | null>({
      uuid: 'uuid-caller',
      email: 'caller@mineduc.gob.gt',
      firstName: 'Carlos',
      lastName: 'Ramírez',
    });

    // Por defecto el caller es superadmin.
    getOneEPersonFn = vi.fn().mockReturnValue(
      of(buildEPerson({ uuid: 'uuid-caller', email: 'caller@mineduc.gob.gt' })),
    );
    getGroupsOfEPersonFn = vi.fn().mockReturnValue(of(paginated([adminGlobal])));

    listEPersonsFn = vi.fn().mockReturnValue(of(empty<EPerson>()));
    createEPersonFn = vi.fn();
    deleteEPersonFn = vi.fn().mockReturnValue(of(undefined));
    setActiveEPersonFn = vi.fn();
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
        { provide: AuthService, useValue: { currentUser: currentAuthUser } },
        {
          provide: EPersonApiService,
          useValue: {
            list: listEPersonsFn,
            getOne: getOneEPersonFn,
            create: createEPersonFn,
            delete: deleteEPersonFn,
            setActive: setActiveEPersonFn,
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

  describe('currentUserView$', () => {
    /** Verifica que sin sesión el observable emita null. */
    it('should emit null when the auth user is null', async () => {
      currentAuthUser.set(null);
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
      getGroupsOfEPersonFn.mockReturnValue(of(paginated([adminBasica])));
      const view = await firstValueFrom(service.currentUserView$);
      expect(view?.role).toBe('admin_subdireccion');
      expect(view?.subdivision).toBe('ED_BASICA');
    });
  });

  describe('getVisibleUsers$()', () => {
    /** Verifica que el listado pida epersons con embed=groups y page 0 al tope de USERS_PAGE_SIZE. */
    it('should call EPersonApi.list with embed=groups on the first page', async () => {
      await firstValueFrom(service.getVisibleUsers$());
      expect(listEPersonsFn).toHaveBeenCalledWith({ size: 100, page: 0, embed: 'groups' });
    });

    /**
     * Verifica que al haber más páginas el facade pida todas en paralelo y
     * concatene resultados; el techo del page size es el máximo del backend,
     * no del dataset visible.
     */
    it('should fetch every page in parallel when totalPages > 1 and concatenate items', async () => {
      const firstPage = {
        items: [buildEPerson({ uuid: 'uuid-p0', email: 'p0@mineduc.gob.gt', groups: [adminGlobal] })],
        totalElements: 2,
        totalPages: 2,
        size: 1,
        page: 0,
      };
      const secondPage = {
        items: [buildEPerson({ uuid: 'uuid-p1', email: 'p1@mineduc.gob.gt', groups: [adminGlobal] })],
        totalElements: 2,
        totalPages: 2,
        size: 1,
        page: 1,
      };
      listEPersonsFn.mockImplementation((opts: { page?: number }) => {
        if (opts?.page === 0) return of(firstPage);
        if (opts?.page === 1) return of(secondPage);
        return of(empty<EPerson>());
      });

      const result = await firstValueFrom(service.getVisibleUsers$());

      expect(listEPersonsFn).toHaveBeenCalledWith({ size: 100, page: 0, embed: 'groups' });
      expect(listEPersonsFn).toHaveBeenCalledWith({ size: 100, page: 1, embed: 'groups' });
      const uuids = result.items.map((v) => v.uuid).sort();
      expect(uuids).toEqual(['uuid-p0', 'uuid-p1']);
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
      getGroupsOfEPersonFn.mockReturnValue(of(paginated([adminBasica])));
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
      getGroupsOfEPersonFn.mockReturnValue(of(paginated([adminBasica])));
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
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') return of(paginated([adminBasica]));
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
      getGroupsOfEPersonFn.mockReturnValue(of(paginated([adminBasica])));
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
      getGroupsOfEPersonFn.mockImplementation((uuid: string) => {
        if (uuid === 'uuid-caller') return of(paginated([adminBasica]));
        return of(paginated([adminTrabajo]));
      });

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
});
