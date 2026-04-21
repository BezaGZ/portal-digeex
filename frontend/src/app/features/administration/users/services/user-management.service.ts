import { Injectable, signal, computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';

import { UserView, UserRole, UserStatus } from '../models/user-view.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { EPersonApiService } from '../../../../core/api/eperson-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { DSpaceApiService } from '../../../../core/api/dspace-api.service';
import { EPerson } from '../../../../core/api/models/eperson.model';
import { Group } from '../../../../core/api/models/group.model';
import { Paginated } from '../../../../core/api/models/hal.model';
import {
  ADMINISTRATOR_GROUP_NAME,
  COLLECTION_OBJECT_PATH,
  COMMUNITY_OBJECT_PATH,
  extractOwningCommunityUuid,
  resolveRoleFromGroups,
} from './role-resolver';
import { BusinessRuleError } from './business-rule-error';

/**
 * Entrada del facade para crear un usuario nuevo.
 * subdivisionCommunityUuid se exige para admin_subdireccion y personal_delegado.
 * collectionUuids solo aplica a personal_delegado: la lista que el UI ya
 * resolvió (una colección puntual o todas las de la subdirección).
 */
export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  subdivisionCommunityUuid: string | null;
  collectionUuids?: string[];
}

/**
 * Entrada del facade para cambiar el rol de un usuario existente.
 * Misma forma que CreateUserInput pero sin datos de identificación,
 * porque el eperson ya existe y solo se mueven sus grupos.
 */
export interface ChangeUserRoleInput {
  uuid: string;
  newRole: UserRole;
  newSubdivisionCommunityUuid: string | null;
  newCollectionUuids?: string[];
}

/** Proyección HAL de DSpace para anidar los grupos dentro del eperson. */
const EMBED_GROUPS = 'groups';

/**
 * Proyecciones HAL para anidar el grupo dueño dentro de community y
 * collection. DSpace los expone bajo estos nombres fijos en el contrato
 * REST 9.2; se guardan como constantes para evitar typos silenciosos.
 */
const EMBED_ADMIN_GROUP = 'adminGroup';
const EMBED_SUBMITTERS_GROUP = 'submittersGroup';

/** Claves del metadata canónico de DSpace para primer y último nombre. */
const METADATA_FIRSTNAME = 'eperson.firstname';
const METADATA_LASTNAME = 'eperson.lastname';

/** Dominio que RN-02 exige para los correos institucionales. */
const INSTITUTIONAL_EMAIL_DOMAIN = '@mineduc.gob.gt';

/**
 * Tupla interna con el rol y la community uuid ya resueltos desde los
 * grupos embebidos. Evita recalcular la proyección cuando solo falta
 * pedir el nombre legible de la community.
 */
interface ResolvedEPerson {
  readonly eperson: EPerson;
  readonly role: UserRole;
  readonly communityUuid: string | null;
}

/**
 * Facade del dominio de usuarios administrativos.
 * Lee de DSpace vía EPerson/Group/Community API y deriva el rol con
 * resolveRoleFromGroups. Las mutaciones y reglas de negocio viven aparte.
 */
@Injectable({
  providedIn: 'root',
})
export class UserManagementService {
  private readonly authService = inject(AuthService);
  private readonly epersonApi = inject(EPersonApiService);
  private readonly groupApi = inject(GroupApiService);
  private readonly dspaceApi = inject(DSpaceApiService);

  /**
   * Vista del usuario logueado con el rol ya resuelto. Pide el eperson
   * con ?embed=groups y cachea con shareReplay para que getVisibleUsers$
   * no lo repita en cada invocación.
   */
  readonly currentUserView$: Observable<UserView | null> = toObservable(this.authService.currentUser).pipe(
    switchMap((authUser) => {
      if (!authUser) return of<UserView | null>(null);
      return this.epersonApi
        .getOne(authUser.uuid, { embed: EMBED_GROUPS })
        .pipe(switchMap((eperson) => this.buildSingleUserView(eperson)));
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Listado paginado filtrado al alcance del caller. Una sola llamada
   * con embed=groups resuelve los roles de toda la página; las communities
   * se piden una vez por uuid único.
   */
  getVisibleUsers$(
    params: { size?: number; page?: number } = {},
  ): Observable<Paginated<UserView>> {
    return this.currentUserView$.pipe(
      switchMap((currentUser) =>
        this.epersonApi
          .list({ ...params, embed: EMBED_GROUPS })
          .pipe(switchMap((paginatedResult) => this.mapPaginatedToUserViews(paginatedResult, currentUser))),
      ),
    );
  }

  /**
   * Resuelve roles por eperson, junta los community uuids únicos y los
   * pide en un solo forkJoin en vez de una llamada por usuario.
   */
  private mapPaginatedToUserViews(
    paginatedResult: Paginated<EPerson>,
    currentUser: UserView | null,
  ): Observable<Paginated<UserView>> {
    const resolved = paginatedResult.items
      .map((eperson) => this.resolveEPerson(eperson))
      .filter((item): item is ResolvedEPerson => item !== null);

    const uniqueCommunityUuids = Array.from(
      new Set(
        resolved
          .map((item) => item.communityUuid)
          .filter((uuid): uuid is string => uuid !== null),
      ),
    );

    return this.fetchCommunityNames(uniqueCommunityUuids).pipe(
      map((communityNames) => {
        const views = resolved.map((item) =>
          this.assembleUserView(
            item.eperson,
            item.role,
            item.communityUuid ? communityNames.get(item.communityUuid) ?? null : null,
          ),
        );
        return { ...paginatedResult, items: this.applyCallerScope(views, currentUser) };
      }),
    );
  }

  /**
   * Rama de un solo eperson (currentUserView$). Reutiliza fetchCommunityNames
   * aunque el set sea 0 o 1 para mantener un único punto de resolución.
   */
  private buildSingleUserView(eperson: EPerson): Observable<UserView | null> {
    const resolved = this.resolveEPerson(eperson);
    if (!resolved) return of(null);
    const uuids = resolved.communityUuid ? [resolved.communityUuid] : [];
    return this.fetchCommunityNames(uuids).pipe(
      map((communityNames) =>
        this.assembleUserView(
          resolved.eperson,
          resolved.role,
          resolved.communityUuid ? communityNames.get(resolved.communityUuid) ?? null : null,
        ),
      ),
    );
  }

  /**
   * Mapa uuid→nombre para la lista dada. Cortocircuita cuando viene vacía
   * para no invocar forkJoin sobre [].
   */
  private fetchCommunityNames(uuids: string[]): Observable<Map<string, string>> {
    if (uuids.length === 0) return of(new Map<string, string>());
    return forkJoin(
      uuids.map((uuid) =>
        this.dspaceApi.getCommunity(uuid).pipe(map((community) => [uuid, community.name] as const)),
      ),
    ).pipe(map((entries) => new Map(entries)));
  }

  /** Proyecta rol y community uuid desde los grupos embebidos del eperson. */
  private resolveEPerson(eperson: EPerson): ResolvedEPerson | null {
    const groups = this.extractEmbeddedGroups(eperson);
    const role = resolveRoleFromGroups(groups);
    if (role === null) return null;
    const communityUuid =
      role === 'admin_subdireccion' ? extractOwningCommunityUuid(groups) : null;
    return { eperson, role, communityUuid };
  }

  /** Lee los grupos bajo _embedded.groups._embedded.groups (forma HAL anidada). */
  private extractEmbeddedGroups(eperson: EPerson): Group[] {
    return eperson._embedded?.groups?._embedded?.[EMBED_GROUPS] ?? [];
  }

  /** Arma el UserView final con metadata canónica y canLogIn → status. */
  private assembleUserView(
    eperson: EPerson,
    role: UserRole,
    subdivision: string | null,
  ): UserView {
    return {
      uuid: eperson.uuid,
      email: eperson.email,
      firstName: eperson.metadata[METADATA_FIRSTNAME]?.[0]?.value ?? '',
      lastName: eperson.metadata[METADATA_LASTNAME]?.[0]?.value ?? '',
      role,
      subdivision,
      status: eperson.canLogIn ? 'active' : 'inactive',
      lastActive: eperson.lastActive,
    };
  }

  /** RN-08: admin_subdireccion solo ve su subdivisión; superadmin ve todo. */
  private applyCallerScope(userViews: UserView[], currentUser: UserView | null): UserView[] {
    if (!currentUser) return [];
    if (currentUser.role === 'superadmin') return userViews;
    if (currentUser.role === 'admin_subdireccion') {
      return userViews.filter((view) => view.subdivision === currentUser.subdivision);
    }
    return [];
  }

  /**
   * Crea un usuario en DSpace y lo asigna al grupo que corresponde al rol.
   * Valida primero las reglas de dominio puras (RN-02, RN-26) y luego el
   * scope del caller (RN-08, RN-13) contra su propio rol resuelto desde
   * DSpace. Solo si todo pasa dispara el POST al backend.
   */
  createUser$(input: CreateUserInput): Observable<EPerson> {
    if (!input.email.endsWith(INSTITUTIONAL_EMAIL_DOMAIN)) {
      return throwError(
        () =>
          new BusinessRuleError(
            'EMAIL_INVALID',
            `El correo debe ser institucional (${INSTITUTIONAL_EMAIL_DOMAIN}).`,
          ),
      );
    }
    if (input.role !== 'superadmin' && !input.subdivisionCommunityUuid) {
      return throwError(
        () => new BusinessRuleError('SUBDIVISION_REQUIRED', 'Debes asignar una subdirección.'),
      );
    }

    return this.getCallerContext$().pipe(
      switchMap((caller) => {
        const scopeError = this.validateCreateScope(caller, input);
        if (scopeError) return throwError(() => scopeError);

        return this.epersonApi
          .create({ email: input.email, firstName: input.firstName, lastName: input.lastName })
          .pipe(
            switchMap((created) =>
              this.assignToRoleGroups$(created, {
                role: input.role,
                subdivisionCommunityUuid: input.subdivisionCommunityUuid,
                collectionUuids: input.collectionUuids,
              }).pipe(map(() => created)),
            ),
          );
      }),
    );
  }

  /**
   * Desactiva un usuario conmutando canLogIn a false. Protege RN-11
   * (último superadmin activo) consultando los miembros del grupo global
   * Administrator, y RN-12 comparando el uuid con el caller autenticado.
   */
  deactivateUser$(uuid: string): Observable<EPerson> {
    const currentUuid = this.authService.currentUser()?.uuid ?? null;
    if (currentUuid && uuid === currentUuid) {
      return throwError(
        () => new BusinessRuleError('SELF_DEACTIVATE', 'No puedes desactivarte a ti mismo.'),
      );
    }

    return this.groupApi.findAdministratorGroup().pipe(
      switchMap((admin) =>
        this.groupApi.getMembersOfGroup(admin.uuid).pipe(
          switchMap((members) => {
            const targetIsAdmin = members.items.some((member) => member.uuid === uuid);
            const activeAdmins = members.items.filter((member) => member.canLogIn);
            if (targetIsAdmin && activeAdmins.length <= 1) {
              return throwError(
                () =>
                  new BusinessRuleError(
                    'LAST_SUPERADMIN',
                    'No se puede desactivar al último superadministrador activo.',
                  ),
              );
            }
            return this.epersonApi.setActive(uuid, false);
          }),
        ),
      ),
    );
  }

  /**
   * Reactiva un usuario previamente desactivado. No aplica RN-11 ni RN-12
   * porque reactivar no puede dejar al sistema sin superadmin activo ni
   * bloquear al caller, así que delega directo al JSON Patch de DSpace.
   */
  reactivateUser$(uuid: string): Observable<EPerson> {
    return this.epersonApi.setActive(uuid, true);
  }

  /**
   * Mueve al eperson del grupo que tiene asignado al grupo del nuevo rol.
   * Solo el superadmin puede ejecutarlo (RN-13): el admin_subdireccion no
   * puede promover a nadie a su mismo nivel ni por encima, y el personal
   * delegado no cambia roles en absoluto. Se remueve de los grupos
   * relacionados con el rol anterior y se agrega a los del rol nuevo.
   */
  changeUserRole$(input: ChangeUserRoleInput): Observable<EPerson> {
    return this.getCallerContext$().pipe(
      switchMap((caller) => {
        if (!caller || caller.role !== 'superadmin') {
          return throwError(
            () =>
              new BusinessRuleError(
                'INSUFFICIENT_PRIVILEGES',
                'Solo un superadministrador puede cambiar roles.',
              ),
          );
        }

        return this.epersonApi.getOne(input.uuid, { embed: EMBED_GROUPS }).pipe(
          switchMap((target) => {
            const roleGroups = this.filterRoleRelatedGroups(this.extractEmbeddedGroups(target));
            const removals$ =
              roleGroups.length === 0
                ? of([] as unknown[])
                : forkJoin(
                    roleGroups.map((group) =>
                      this.groupApi.removeMemberFromGroup(group.uuid, input.uuid),
                    ),
                  );

            return removals$.pipe(
              switchMap(() =>
                this.assignToRoleGroups$(target, {
                  role: input.newRole,
                  subdivisionCommunityUuid: input.newSubdivisionCommunityUuid,
                  collectionUuids: input.newCollectionUuids,
                }),
              ),
              map(() => target),
            );
          }),
        );
      }),
    );
  }

  /**
   * Reenvía el correo nativo de DSpace con token para que el usuario
   * fije una nueva contraseña. Delega al endpoint /eperson/registrations
   * con accountRequestType=forgot, que ya resuelve EPersonApiService.
   */
  resetPassword$(email: string): Observable<unknown> {
    return this.epersonApi.resendRegistration(email);
  }

  /**
   * Resuelve el rol y la community uuid del caller autenticado leyendo su
   * eperson con embed=groups. Devuelve null si no hay sesión o si el
   * usuario no tiene ningún grupo que lo mapee a un rol del portal.
   */
  private getCallerContext$(): Observable<ResolvedEPerson | null> {
    const authUser = this.authService.currentUser();
    if (!authUser) return of(null);
    return this.epersonApi
      .getOne(authUser.uuid, { embed: EMBED_GROUPS })
      .pipe(map((eperson) => this.resolveEPerson(eperson)));
  }

  /**
   * Aplica RN-08 y RN-13 al intento de crear: el admin_subdireccion solo
   * puede crear personal delegado DENTRO de su propia community; cualquier
   * otro rol o community ajeno eleva permisos y se corta.
   */
  private validateCreateScope(
    caller: ResolvedEPerson | null,
    input: CreateUserInput,
  ): BusinessRuleError | null {
    if (!caller) {
      return new BusinessRuleError('INSUFFICIENT_PRIVILEGES', 'Sin permisos para crear usuarios.');
    }
    if (caller.role === 'superadmin') return null;
    if (caller.role === 'admin_subdireccion') {
      if (input.role !== 'personal_delegado') {
        return new BusinessRuleError(
          'INSUFFICIENT_PRIVILEGES',
          'Un admin de subdirección solo puede crear personal delegado.',
        );
      }
      if (input.subdivisionCommunityUuid !== caller.communityUuid) {
        return new BusinessRuleError(
          'INSUFFICIENT_PRIVILEGES',
          'Solo puedes crear usuarios dentro de tu subdirección.',
        );
      }
      return null;
    }
    return new BusinessRuleError('INSUFFICIENT_PRIVILEGES', 'Sin permisos para crear usuarios.');
  }

  /**
   * Resuelve los uuid de los grupos destino según el rol asignado:
   *  - superadmin        → [Administrator.uuid]
   *  - admin_subdireccion → [community.adminGroup.uuid]
   *  - personal_delegado → collections.map(c => c.submittersGroup.uuid)
   * No tiene efectos: solo lee DSpace y devuelve uuids. La mutación
   * (addMember) vive aparte para que el resolver pueda reusarse desde
   * casos de solo lectura (p. ej. pre-visualizar grupos antes de
   * confirmar un cambio de rol en el UI).
   */
  private resolveTargetGroupUuids$(assignment: {
    role: UserRole;
    subdivisionCommunityUuid: string | null;
    collectionUuids?: string[];
  }): Observable<string[]> {
    if (assignment.role === 'superadmin') {
      return this.groupApi.findAdministratorGroup().pipe(map((admin) => [admin.uuid]));
    }
    if (assignment.role === 'admin_subdireccion') {
      if (!assignment.subdivisionCommunityUuid) {
        return throwError(
          () =>
            new BusinessRuleError(
              'SUBDIVISION_REQUIRED',
              'Falta la subdirección para asignar admin_subdireccion.',
            ),
        );
      }
      return this.dspaceApi
        .getCommunity(assignment.subdivisionCommunityUuid, { embed: EMBED_ADMIN_GROUP })
        .pipe(
          map((community) => {
            const adminGroup = community._embedded?.adminGroup;
            if (!adminGroup) {
              throw new Error(`Community ${community.uuid} no expone adminGroup.`);
            }
            return [adminGroup.uuid];
          }),
        );
    }

    const collectionUuids = assignment.collectionUuids ?? [];
    if (collectionUuids.length === 0) return of([]);
    return forkJoin(
      collectionUuids.map((collectionUuid) =>
        this.dspaceApi.getCollection(collectionUuid, { embed: EMBED_SUBMITTERS_GROUP }).pipe(
          map((collection) => {
            const submittersGroup = collection._embedded?.submittersGroup;
            if (!submittersGroup) {
              throw new Error(`Collection ${collection.uuid} no expone submittersGroup.`);
            }
            return submittersGroup.uuid;
          }),
        ),
      ),
    );
  }

  /**
   * Agrega al eperson a cada grupo destino devuelto por el resolver.
   * Se queda chiquita a propósito: la lógica de "a qué grupo va" la pone
   * resolveTargetGroupUuids$; acá solo se hace el POST por cada uuid.
   */
  private assignToRoleGroups$(
    eperson: EPerson,
    assignment: {
      role: UserRole;
      subdivisionCommunityUuid: string | null;
      collectionUuids?: string[];
    },
  ): Observable<unknown> {
    return this.resolveTargetGroupUuids$(assignment).pipe(
      switchMap((groupUuids) => {
        if (groupUuids.length === 0) return of(undefined);
        return forkJoin(
          groupUuids.map((groupUuid) => this.groupApi.addMemberToGroup(groupUuid, eperson.uuid)),
        );
      }),
    );
  }

  /**
   * Filtra los grupos que representan roles del portal (RN-07, RN-08,
   * RN-13). Se usa al cambiar rol para no borrar al eperson de grupos
   * que no tienen que ver con su rol (p. ej. grupos de colaboración
   * que algún día se modelen aparte). Reusa las mismas constantes que
   * resolveRoleFromGroups para que no se dupliquen los criterios de
   * "qué es un grupo de rol".
   */
  private filterRoleRelatedGroups(groups: Group[]): Group[] {
    return groups.filter((group) => {
      if (group.name === ADMINISTRATOR_GROUP_NAME) return true;
      const objectHref = group._links?.object?.href ?? '';
      return objectHref.includes(COMMUNITY_OBJECT_PATH) || objectHref.includes(COLLECTION_OBJECT_PATH);
    });
  }

  private usersSignal = signal<UserView[]>([
    {
      uuid: '1a2b3c4d-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
      email: 'carlos.ramirez@mineduc.gob.gt',
      firstName: 'Carlos',
      lastName: 'Ramírez',
      role: 'superadmin',
      subdivision: null,
      status: 'active',
      lastActive: '2026-02-13T10:30:00Z',
    },
    {
      uuid: '2b3c4d5e-6f7g-8h9i-0j1k-l2m3n4o5p6q7',
      email: 'ana.lopez@mineduc.gob.gt',
      firstName: 'Ana',
      lastName: 'López',
      role: 'superadmin',
      subdivision: null,
      status: 'active',
      lastActive: '2026-02-12T15:45:00Z',
    },
    {
      uuid: '3c4d5e6f-7g8h-9i0j-1k2l-m3n4o5p6q7r8',
      email: 'mario.garcia@mineduc.gob.gt',
      firstName: 'Mario',
      lastName: 'García',
      role: 'admin_subdireccion',
      subdivision: 'Educación Básica',
      status: 'active',
      lastActive: '2026-02-13T09:15:00Z',
    },
    {
      uuid: '4d5e6f7g-8h9i-0j1k-2l3m-n4o5p6q7r8s9',
      email: 'lucia.mendez@mineduc.gob.gt',
      firstName: 'Lucía',
      lastName: 'Méndez',
      role: 'admin_subdireccion',
      subdivision: 'Educación para el Trabajo y la Cultura',
      status: 'active',
      lastActive: '2026-02-11T14:20:00Z',
    },
    {
      uuid: '5e6f7g8h-9i0j-1k2l-3m4n-o5p6q7r8s9t0',
      email: 'pedro.santos@mineduc.gob.gt',
      firstName: 'Pedro',
      lastName: 'Santos',
      role: 'admin_subdireccion',
      subdivision: 'Investigación y Proyectos Educativos',
      status: 'active',
      lastActive: '2026-02-13T11:00:00Z',
    },
    {
      uuid: '6f7g8h9i-0j1k-2l3m-4n5o-p6q7r8s9t0u1',
      email: 'rosa.juarez@mineduc.gob.gt',
      firstName: 'Rosa',
      lastName: 'Juárez',
      role: 'personal_delegado',
      subdivision: 'Educación Básica',
      status: 'active',
      lastActive: '2026-02-10T16:30:00Z',
    },
    {
      uuid: '7g8h9i0j-1k2l-3m4n-5o6p-q7r8s9t0u1v2',
      email: 'juan.morales@mineduc.gob.gt',
      firstName: 'Juan',
      lastName: 'Morales',
      role: 'personal_delegado',
      subdivision: 'Educación Básica',
      status: 'inactive',
      lastActive: '2026-01-15T10:00:00Z',
    },
    {
      uuid: '8h9i0j1k-2l3m-4n5o-6p7q-r8s9t0u1v2w3',
      email: 'maria.cruz@mineduc.gob.gt',
      firstName: 'María',
      lastName: 'Cruz',
      role: 'personal_delegado',
      subdivision: 'Educación para el Trabajo y la Cultura',
      status: 'active',
      lastActive: '2026-02-13T08:45:00Z',
    },
  ]);

  users = this.usersSignal.asReadonly();

  private currentUserSignal = signal<UserView>(this.usersSignal()[0]);
  currentUser = this.currentUserSignal.asReadonly();

  /** Cantidad de superadmins activos (máximo permitido: 2) */
  activeSuperadminsCount = computed(() => {
    return this.usersSignal().filter((u) => u.role === 'superadmin' && u.status === 'active')
      .length;
  });

  /** true si se puede crear un nuevo superadmin (hay menos de 2 activos) */
  canCreateSuperadmin = computed(() => this.activeSuperadminsCount() < 2);

  /**
   * Valida que el correo termine en @mineduc.gob.gt.
   * @param email - Correo a validar
   * @returns Objeto con valid y error opcional
   */
  validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email.endsWith('@mineduc.gob.gt')) {
      return { valid: false, error: 'El correo debe terminar en @mineduc.gob.gt' };
    }
    return { valid: true };
  }

  /**
   * Verifica si ya existe una cuenta activa con este correo.
   * @param email - Correo a verificar
   * @param excludeUuid - UUID a excluir de la búsqueda (para edición)
   * @returns true si ya existe otra cuenta activa con ese correo
   */
  emailExistsAsActive(email: string, excludeUuid?: string): boolean {
    return this.usersSignal().some(
      (u) => u.email === email && u.status === 'active' && u.uuid !== excludeUuid,
    );
  }

  /**
   * Crea un nuevo usuario con las validaciones de negocio.
   * Valida correo, duplicados, límite de superadmins y subdirección.
   * @param userData - Datos del nuevo usuario
   * @returns Resultado con success, error opcional y usuario creado
   */
  createUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    subdivision: string | null;
  }): { success: boolean; error?: string; user?: UserView } {
    const emailValidation = this.validateEmail(userData.email);
    if (!emailValidation.valid) {
      return { success: false, error: emailValidation.error };
    }

    if (this.emailExistsAsActive(userData.email)) {
      return { success: false, error: 'Ya existe una cuenta activa con este correo' };
    }

    if (userData.role === 'superadmin' && !this.canCreateSuperadmin()) {
      return { success: false, error: 'Ya existen 2 Superadministradores activos' };
    }

    if (userData.role !== 'superadmin' && !userData.subdivision) {
      return { success: false, error: 'Debe asignar una subdirección' };
    }

    const newUser: UserView = {
      uuid: crypto.randomUUID(),
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      subdivision: userData.subdivision,
      status: 'active',
      lastActive: null,
    };

    this.usersSignal.update((users) => [...users, newUser]);

    return { success: true, user: newUser };
  }

  /**
   * Desactiva un usuario. No permite desactivar al último superadmin
   * ni que un usuario se desactive a sí mismo.
   * @param uuid - UUID del usuario a desactivar
   * @returns Resultado con success y error opcional
   */
  deactivateUser(uuid: string): { success: boolean; error?: string } {
    const user = this.usersSignal().find((u) => u.uuid === uuid);

    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    if (user.role === 'superadmin' && this.activeSuperadminsCount() <= 1) {
      return { success: false, error: 'No se puede desactivar el último Superadmin activo' };
    }

    if (uuid === this.currentUser().uuid) {
      return { success: false, error: 'No puedes desactivarte a ti mismo' };
    }

    this.usersSignal.update((users) =>
      users.map((u) => (u.uuid === uuid ? { ...u, status: 'inactive' as UserStatus } : u)),
    );

    return { success: true };
  }

  /**
   * Reactiva un usuario previamente desactivado.
   * Valida que no se exceda el límite de superadmins y que no haya duplicado de correo.
   * @param uuid - UUID del usuario a reactivar
   * @returns Resultado con success y error opcional
   */
  reactivateUser(uuid: string): { success: boolean; error?: string } {
    const user = this.usersSignal().find((u) => u.uuid === uuid);

    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    if (user.role === 'superadmin' && !this.canCreateSuperadmin()) {
      return { success: false, error: 'Ya existen 2 Superadministradores activos' };
    }

    if (this.emailExistsAsActive(user.email, uuid)) {
      return { success: false, error: 'Ya existe otra cuenta activa con este correo' };
    }

    this.usersSignal.update((users) =>
      users.map((u) => (u.uuid === uuid ? { ...u, status: 'active' as UserStatus } : u)),
    );

    return { success: true };
  }

  /**
   * Cambia el rol y subdirección de un usuario.
   * Valida límite de superadmins y que no se deje sin superadmin activo.
   * @param uuid - UUID del usuario
   * @param newRole - Nuevo rol a asignar
   * @param newSubdivision - Nueva subdirección (null para superadmin)
   * @returns Resultado con success y error opcional
   */
  changeUserRole(
    uuid: string,
    newRole: UserRole,
    newSubdivision: string | null,
  ): { success: boolean; error?: string } {
    const user = this.usersSignal().find((u) => u.uuid === uuid);

    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    const wouldBecomeNewSuperadmin = newRole === 'superadmin' && user.role !== 'superadmin';
    if (wouldBecomeNewSuperadmin && !this.canCreateSuperadmin()) {
      return { success: false, error: 'Ya existen 2 Superadministradores activos' };
    }

    const wouldLeaveSuperadmin = user.role === 'superadmin' && newRole !== 'superadmin';
    if (wouldLeaveSuperadmin && this.activeSuperadminsCount() <= 1) {
      return { success: false, error: 'No se puede cambiar el rol del último Superadmin activo' };
    }

    if (newRole !== 'superadmin' && !newSubdivision) {
      return { success: false, error: 'Debe asignar una subdirección' };
    }

    this.usersSignal.update((users) =>
      users.map((u) =>
        u.uuid === uuid ? { ...u, role: newRole, subdivision: newSubdivision } : u,
      ),
    );

    return { success: true };
  }

  /**
   * Reenvía el correo para que el usuario fije una nueva contraseña.
   * En el Ciclo 9 este método pasa a llamar a EPersonApiService.resendRegistration,
   * que dispara el correo con token de DSpace. Por ahora solo valida que el
   * usuario exista para mantener compatibilidad con el UI que tenemos en este punto.
   * @param uuid - UUID del usuario
   * @returns Resultado con success y error opcional
   */
  resetPassword(uuid: string): { success: boolean; error?: string } {
    const user = this.usersSignal().find((u) => u.uuid === uuid);

    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    return { success: true };
  }

  /**
   * Devuelve los usuarios visibles según el rol del usuario actual.
   * Superadmin ve todos; admin de subdirección solo ve su subdirección.
   * @returns Arreglo de usuarios visibles
   */
  getVisibleUsers(): UserView[] {
    const current = this.currentUser();

    if (current.role === 'superadmin') {
      return this.usersSignal();
    }

    if (current.role === 'admin_subdireccion') {
      return this.usersSignal().filter((u) => u.subdivision === current.subdivision);
    }

    return [];
  }

  /**
   * Devuelve los roles que el usuario actual puede asignar al crear.
   * Superadmin puede crear cualquier rol; admin solo personal delegado.
   * @returns Arreglo de roles permitidos
   */
  getAllowedRolesForCreation(): UserRole[] {
    const current = this.currentUser();

    if (current.role === 'superadmin') {
      return ['superadmin', 'admin_subdireccion', 'personal_delegado'];
    }

    if (current.role === 'admin_subdireccion') {
      return ['personal_delegado'];
    }

    return [];
  }

  /**
   * Devuelve la subdirección por defecto para nuevos usuarios.
   * Si el creador es admin de subdirección, se asigna su propia subdirección.
   * @returns Subdirección por defecto o null si es superadmin
   */
  getDefaultSubdivision(): string | null {
    const current = this.currentUser();

    if (current.role === 'admin_subdireccion') {
      return current.subdivision;
    }

    return null;
  }

  /**
   * Indica si el usuario actual tiene permiso para cambiar roles.
   * Solo los superadmins pueden modificar roles de otros usuarios.
   * @returns true si el usuario actual es superadmin
   */
  canModifyRoles(): boolean {
    return this.currentUser().role === 'superadmin';
  }
}
