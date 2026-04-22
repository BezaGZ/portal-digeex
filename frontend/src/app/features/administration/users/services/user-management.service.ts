import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

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

/**
 * Proyección HAL `embed=groups` aplicable solo al listado paginado `/api/eperson/epersons`,
 * donde anida los grupos de cada item bajo su `_embedded`. Para un único eperson los grupos
 * se piden por el subrecurso `/eperson/epersons/{uuid}/groups` vía `GroupApiService`.
 */
const EMBED_GROUPS = 'groups';

/** Nombres fijos en HAL para anidar el grupo dueño dentro de community y collection. */
const EMBED_ADMIN_GROUP = 'adminGroup';
const EMBED_SUBMITTERS_GROUP = 'submittersGroup';

/** Claves del metadata canónico de DSpace para primer y último nombre. */
const METADATA_FIRSTNAME = 'eperson.firstname';
const METADATA_LASTNAME = 'eperson.lastname';

/** Dominio que RN-02 exige para los correos institucionales. */
const INSTITUTIONAL_EMAIL_DOMAIN = '@mineduc.gob.gt';

/** Error que propaga `currentUserView$` cuando el eperson autenticado no pertenece a ningún grupo de rol del portal. */
export const NO_ROLE_GROUP_ERROR =
  'El usuario autenticado no tiene un grupo de rol asignado.';

/** Tupla interna con el rol y el community uuid resueltos desde los grupos del eperson. */
interface ResolvedEPerson {
  readonly eperson: EPerson;
  readonly role: UserRole;
  readonly communityUuid: string | null;
}

interface OrphanEPerson {
  readonly eperson: EPerson;
  readonly role: null;
  readonly communityUuid: null;
}

type ResolvedEPersonOrOrphan = ResolvedEPerson | OrphanEPerson;

/**
 * Facade del dominio de usuarios administrativos. Lee de DSpace vía EPerson/Group/Community API,
 * deriva el rol con `resolveRoleFromGroups` y encapsula las mutaciones manteniendo la invariante
 * "todo eperson del portal tiene grupo de rol": el alta deshace el `delete` si la asignación al
 * grupo falla y el cambio de rol agrega al grupo nuevo antes de retirar del anterior.
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
   * Vista del usuario autenticado con el rol resuelto. Pide eperson y grupos por separado vía
   * el subrecurso `/groups`, cachea con `shareReplay` y propaga error cuando el eperson no
   * pertenece a ningún grupo de rol del portal.
   */
  readonly currentUserView$: Observable<UserView | null> = toObservable(
    this.authService.currentUser,
  ).pipe(
    switchMap((authUser) => {
      if (!authUser) return of<UserView | null>(null);
      return this.fetchEPersonWithGroups$(authUser.uuid).pipe(
        switchMap(({ eperson, groups }) => {
          const resolved = this.resolveEPersonFromGroups(eperson, groups);
          if (resolved.role === null) {
            return throwError(() => new Error(NO_ROLE_GROUP_ERROR));
          }
          return this.assembleSingleUserView$(resolved);
        }),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Listado paginado filtrado al alcance del caller. Aprovecha la
   * proyección `?embed=groups` del endpoint de colección, que DSpace sí
   * hidrata por item, evitando un GET por usuario. Los epersons sin
   * grupo de rol se descartan del listado.
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
   * Resuelve roles por eperson, descarta los que no tienen rol del portal y agrupa los
   * community uuids únicos en un único forkJoin. Conserva la paginación del backend.
   */
  private mapPaginatedToUserViews(
    paginatedResult: Paginated<EPerson>,
    currentUser: UserView | null,
  ): Observable<Paginated<UserView>> {
    const resolved = paginatedResult.items
      .map((eperson) => this.resolveEPersonFromGroups(eperson, this.extractEmbeddedGroups(eperson)))
      .filter((item): item is ResolvedEPerson => item.role !== null);

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

  /** Arma el UserView de un solo eperson resolviendo el nombre legible de la community cuando aplica. */
  private assembleSingleUserView$(resolved: ResolvedEPerson): Observable<UserView> {
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

  /** Mapa uuid→nombre legible de la community. Cortocircuita la lista vacía para evitar `forkJoin([])`. */
  private fetchCommunityNames(uuids: string[]): Observable<Map<string, string>> {
    if (uuids.length === 0) return of(new Map<string, string>());
    return forkJoin(
      uuids.map((uuid) =>
        this.dspaceApi.getCommunity(uuid).pipe(map((community) => [uuid, community.name] as const)),
      ),
    ).pipe(map((entries) => new Map(entries)));
  }

  /** Pide el eperson y sus grupos en paralelo usando el subrecurso `/eperson/epersons/{uuid}/groups`. */
  private fetchEPersonWithGroups$(
    uuid: string,
  ): Observable<{ eperson: EPerson; groups: Group[] }> {
    return forkJoin({
      eperson: this.epersonApi.getOne(uuid),
      groups: this.groupApi.getGroupsOfEPerson(uuid).pipe(map((page) => page.items)),
    });
  }

  /**
   * Proyecta rol y community uuid a partir del eperson y sus grupos.
   * Devuelve role=null cuando el eperson no pertenece a ningún grupo de rol del portal.
   */
  private resolveEPersonFromGroups(
    eperson: EPerson,
    groups: Group[],
  ): ResolvedEPersonOrOrphan {
    const role = resolveRoleFromGroups(groups);
    if (role === null) {
      return { eperson, role: null, communityUuid: null };
    }
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
   * Crea un eperson, lo asigna al grupo de su rol y dispara el correo de fijación de contraseña.
   * Si la asignación al grupo falla, deshace el alta con `delete(uuid)` para no dejar un eperson
   * sin grupo de rol; un fallo del correo no revierte el alta. Aplica RN-02, RN-26 y RN-08/RN-13.
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
              }).pipe(
                catchError((groupError: unknown) =>
                  this.rollbackCreatedEPerson$(created.uuid, groupError),
                ),
                switchMap(() =>
                  this.epersonApi.resendRegistration(input.email).pipe(map(() => created)),
                ),
              ),
            ),
          );
      }),
    );
  }

  /**
   * Desactiva un usuario conmutando `canLogIn` a false.
   * Protege RN-11 contra los miembros activos de Administrator y RN-12 comparando con el caller.
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

  /** Reactiva un usuario poniendo `canLogIn=true`. RN-11 y RN-12 no aplican al reactivar. */
  reactivateUser$(uuid: string): Observable<EPerson> {
    return this.epersonApi.setActive(uuid, true);
  }

  /**
   * Cambia el rol de un eperson moviéndolo entre grupos. Solo el superadmin lo ejecuta (RN-13).
   * Para no dejar al target sin grupo de rol agrega al grupo nuevo antes de retirar del anterior:
   * un fallo del add deja al target en el rol viejo en lugar de quedarlo sin rol.
   * Aplica RN-27 (no autocambio) y RN-28 (no degradar al último superadmin activo).
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

        if (caller.eperson.uuid === input.uuid) {
          return throwError(
            () => new BusinessRuleError('SELF_DEACTIVATE', 'No puedes cambiar tu propio rol.'),
          );
        }

        return this.fetchEPersonWithGroups$(input.uuid).pipe(
          switchMap(({ eperson: target, groups: targetGroups }) => {
            const targetIsAdmin = targetGroups.some(
              (group) => group.name === ADMINISTRATOR_GROUP_NAME,
            );
            const isDemotion = targetIsAdmin && input.newRole !== 'superadmin';

            const guard$: Observable<unknown> = isDemotion
              ? this.groupApi.findAdministratorGroup().pipe(
                  switchMap((admin) => this.groupApi.getMembersOfGroup(admin.uuid)),
                  switchMap((members) => {
                    const activeAdmins = members.items.filter((member) => member.canLogIn);
                    if (activeAdmins.length <= 1) {
                      return throwError(
                        () =>
                          new BusinessRuleError(
                            'LAST_SUPERADMIN',
                            'No se puede degradar al último superadministrador activo.',
                          ),
                      );
                    }
                    return of(undefined);
                  }),
                )
              : of(undefined);

            return guard$.pipe(
              switchMap(() =>
                this.assignToRoleGroups$(target, {
                  role: input.newRole,
                  subdivisionCommunityUuid: input.newSubdivisionCommunityUuid,
                  collectionUuids: input.newCollectionUuids,
                }).pipe(
                  switchMap(() => this.removeFromPreviousRoleGroups$(target.uuid, targetGroups)),
                  map(() => target),
                ),
              ),
            );
          }),
        );
      }),
    );
  }

  /** Reenvía el correo nativo de DSpace con token para que el usuario fije nueva contraseña. */
  resetPassword$(email: string): Observable<unknown> {
    return this.epersonApi.resendRegistration(email);
  }

  /**
   * Resuelve rol y community uuid del caller autenticado leyendo su eperson y grupos.
   * Devuelve null sin sesión o sin grupo de rol del portal; los callers lo traducen a INSUFFICIENT_PRIVILEGES.
   */
  private getCallerContext$(): Observable<ResolvedEPerson | null> {
    const authUser = this.authService.currentUser();
    if (!authUser) return of(null);
    return this.fetchEPersonWithGroups$(authUser.uuid).pipe(
      map(({ eperson, groups }) => {
        const resolved = this.resolveEPersonFromGroups(eperson, groups);
        if (resolved.role === null) return null;
        return { eperson: resolved.eperson, role: resolved.role, communityUuid: resolved.communityUuid };
      }),
    );
  }

  /**
   * Aplica RN-08 y RN-13 al intento de crear: `admin_subdireccion` solo puede crear personal
   * delegado dentro de su propia community; cualquier otro rol o community ajeno se corta.
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
   * `superadmin` → `[Administrator.uuid]`; `admin_subdireccion` → `[community.adminGroup.uuid]`;
   * `personal_delegado` → `collections.map(c => c.submittersGroup.uuid)`. Solo lectura.
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

  /** Agrega al eperson a cada grupo destino resuelto por `resolveTargetGroupUuids$`. */
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
   * Deshace el alta de un eperson recién creado cuando la asignación al grupo de rol falla.
   * Si el `delete` también falla se ignora el error secundario y se propaga la causa original.
   */
  private rollbackCreatedEPerson$(uuid: string, originalError: unknown): Observable<never> {
    return this.epersonApi.delete(uuid).pipe(
      catchError(() => of(undefined)),
      switchMap(() => throwError(() => originalError)),
    );
  }

  /**
   * Retira al eperson de los grupos de rol del portal a los que pertenecía.
   * Filtra el snapshot recibido para no tocar grupos ajenos al rol y cortocircuita la lista vacía.
   */
  private removeFromPreviousRoleGroups$(
    epersonUuid: string,
    previousGroups: Group[],
  ): Observable<unknown> {
    const roleGroups = this.filterRoleRelatedGroups(previousGroups);
    if (roleGroups.length === 0) return of(undefined);
    return forkJoin(
      roleGroups.map((group) => this.groupApi.removeMemberFromGroup(group.uuid, epersonUuid)),
    );
  }

  /**
   * Filtra los grupos que representan roles del portal (RN-07, RN-08, RN-13).
   * Comparte criterios con `resolveRoleFromGroups` para no duplicar la definición de "grupo de rol".
   */
  private filterRoleRelatedGroups(groups: Group[]): Group[] {
    return groups.filter((group) => {
      if (group.name === ADMINISTRATOR_GROUP_NAME) return true;
      const objectHref = group._links?.object?.href ?? '';
      return objectHref.includes(COMMUNITY_OBJECT_PATH) || objectHref.includes(COLLECTION_OBJECT_PATH);
    });
  }

}
