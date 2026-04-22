import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';

import { UserView, UserRole } from '../models/user-view.model';
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

}
