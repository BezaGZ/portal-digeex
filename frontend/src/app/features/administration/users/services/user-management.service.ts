import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap, take } from 'rxjs/operators';

import { UserView, UserRole } from '../models/user-view.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { EPersonApiService } from '../../../../core/api/eperson-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { EPerson } from '../../../../core/api/models/eperson.model';
import { Group } from '../../../../core/api/models/group.model';
import { Caller } from '../../../../core/auth/caller.model';
import { isSuperadmin } from '../../../../core/auth/role-capabilities';
import { Paginated } from '../../../../core/api/models/hal.model';
import {
  ADMINISTRATOR_GROUP_NAME,
  extractSubdivisionSuffix,
  isPortalRoleGroup,
  resolveRoleFromGroups,
} from './role-resolver';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { isAllowedEmailDomain } from '../../../../core/validators/email-domain.validator';
import { environment } from '../../../../../environments/environment';

/**
 * Entrada del alta. El UI pasa el grupo concreto al que va el eperson (uuid + name).
 * El nombre viaja junto al uuid para que la guarda de scope lo compare sin pedir
 * el grupo de nuevo al backend.
 */
export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  targetGroup: { uuid: string; name: string };
}

/**
 * Entrada del cambio de grupo. Mismo shape que en el alta, pero sobre un eperson
 * que ya existe: el facade lo agrega al grupo nuevo y lo retira de los previos.
 */
export interface ChangeUserRoleInput {
  uuid: string;
  newGroup: { uuid: string; name: string };
}

/**
 * Entrada de la edición de identidad (RN-30). El dialog arma el diff contra el
 * snapshot del target y solo incluye los campos que cambiaron; el facade los
 * traduce directo a JSON Patch sobre el eperson.
 */
export interface UpdateUserInput {
  uuid: string;
  changes: { firstName?: string; lastName?: string; email?: string };
}

/**
 * Parámetros del listado paginado con búsqueda server-side. `scope` alinea
 * al patrón de `EPeopleRegistryComponent` de `dspace-angular`: `metadata`
 * busca parcial en firstname/lastname/email, `email` busca exacto. Query
 * vacía siempre cae al listado base sin filtro.
 */
export interface SearchUsersParams {
  scope: 'metadata' | 'email';
  query: string;
  page: number;
  size: number;
}

/** Proyección HAL `embed=groups` del listado paginado `/api/eperson/epersons`. */
const EMBED_GROUPS = 'groups';

/** Claves del metadata canónico de DSpace para primer y último nombre. */
const METADATA_FIRSTNAME = 'eperson.firstname';
const METADATA_LASTNAME = 'eperson.lastname';

/** Allowlist de dominios institucionales exigida por RN-02; el environment
 *  decide si dev acepta dominios adicionales para testeo. */
const ALLOWED_EMAIL_DOMAINS = environment.allowedEmailDomains;

/**
 * Tope por página al traer el listado completo de grupos asignables. 100 es
 * el máximo aceptado por DSpace en una sola respuesta; `getAssignableGroups$`
 * pide la primera página y después el resto en paralelo para llenar el
 * dropdown sin techo arbitrario.
 */
const LIST_PAGE_SIZE = 100;

/** Error propagado por `currentUserView$` cuando el eperson autenticado no es de rol portal. */
export const NO_ROLE_GROUP_ERROR =
  'El usuario autenticado no tiene un grupo de rol asignado.';

/** Caller resuelto: rol + sufijo de subdivisión derivados del nombre de sus grupos. */
interface ResolvedEPerson {
  readonly eperson: EPerson;
  readonly role: UserRole;
  readonly subdivisionSuffix: string | null;
}

interface OrphanEPerson {
  readonly eperson: EPerson;
  readonly role: null;
  readonly subdivisionSuffix: null;
}

type ResolvedEPersonOrOrphan = ResolvedEPerson | OrphanEPerson;

/**
 * Proyección mínima del caller que necesitan las mutaciones del facade
 * (scope, rol, identidad). Se deriva de `currentUserView$` cacheado sin
 * disparar HTTP adicional.
 */
interface CallerContext {
  readonly uuid: string;
  readonly role: UserRole;
  readonly subdivisionSuffix: string | null;
}

/**
 * Facade de usuarios administrativos alineado al patrón de `dspace-angular`:
 * alta en tres pasos (eperson, uri-list al grupo, registrations) con rollback,
 * cambio de rol add-before-remove, y rol derivado por nombre del grupo porque
 * `_links.object` no apunta al DSO dueño en esta instancia de DSpace 9.2.
 */
@Injectable({
  providedIn: 'root',
})
export class UserManagementService {
  private readonly authService = inject(AuthService);
  private readonly epersonApi = inject(EPersonApiService);
  private readonly groupApi = inject(GroupApiService);

  /**
   * Vista del usuario autenticado con rol y subdivisión resueltos por nombre
   * de grupo. Lee el EPerson con `_embedded.groups` que `AuthService` cacheó
   * tras `login()`/`restoreSession()`; no dispara HTTP propio. `refCount: false`
   * mantiene la suscripción interna viva mientras viva el servicio (singleton),
   * para que topbar, menú y Users container compartan la misma emisión.
   */
  readonly currentUserView$: Observable<UserView | null> = toObservable(
    this.authService.currentEPerson,
  ).pipe(
    switchMap((eperson) => {
      if (!eperson) return of<UserView | null>(null);
      const resolved = this.resolveEPersonFromGroups(
        eperson,
        this.extractEmbeddedGroups(eperson),
      );
      if (resolved.role === null) {
        return throwError(() => new Error(NO_ROLE_GROUP_ERROR));
      }
      return of(this.assembleUserView(resolved));
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /**
   * Snapshot síncrono del caller desde el `currentEPerson` vivo, no del stream
   * cacheado `currentUserView$` (cuyo `shareReplay` puede emitir el caller del
   * usuario anterior). Null si no hay eperson o no tiene grupo de rol del portal.
   */
  resolveCallerSnapshot(): Caller | null {
    const eperson = this.authService.currentEPerson();
    if (!eperson) return null;
    const resolved = this.resolveEPersonFromGroups(eperson, this.extractEmbeddedGroups(eperson));
    return resolved.role !== null
      ? { role: resolved.role, sufijo: resolved.subdivisionSuffix }
      : null;
  }

  /**
   * Listado paginado con búsqueda server-side alineado al patrón
   * `EPeopleRegistryComponent` de `dspace-angular`. Query vacía cae al
   * listado base (`/epersons?page&size&embed=groups`). Scope `metadata` con
   * query usa `search/byMetadata` (parcial sobre firstname/lastname/email).
   * Scope `email` con query usa `search/byEmail` y envuelve el único
   * resultado (o ninguno) en un `Paginated<UserView>` de un solo elemento
   * para que el `p-table` en modo lazy consuma siempre la misma forma.
   */
  searchUsers$(params: SearchUsersParams): Observable<Paginated<UserView>> {
    const trimmed = params.query.trim();
    if (trimmed.length === 0) {
      return this.epersonApi
        .list({ page: params.page, size: params.size, embed: EMBED_GROUPS })
        .pipe(map((paginated) => this.mapPaginatedToUserViews(paginated)));
    }
    if (params.scope === 'email') {
      return this.epersonApi.searchByEmail(trimmed, { embed: EMBED_GROUPS }).pipe(
        map((eperson) => this.wrapSingleAsPaginated(eperson, params.size)),
        map((paginated) => this.mapPaginatedToUserViews(paginated)),
      );
    }
    return this.epersonApi
      .searchByMetadata({
        query: trimmed,
        page: params.page,
        size: params.size,
        embed: EMBED_GROUPS,
      })
      .pipe(map((paginated) => this.mapPaginatedToUserViews(paginated)));
  }

  /**
   * Envuelve un eperson único (o null) como `Paginated<EPerson>` para que
   * el listado con `scope=email` devuelva la misma forma que los otros
   * scopes. `size` se preserva del caller para que el paginador del
   * `p-table` muestre el mismo tamaño de página.
   */
  private wrapSingleAsPaginated(
    eperson: EPerson | null,
    size: number,
  ): Paginated<EPerson> {
    const items = eperson ? [eperson] : [];
    return {
      items,
      totalElements: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      size,
      page: 0,
    };
  }

  /**
   * Grupos asignables del portal. Pagina todas las páginas (mismo patrón que
   * `getVisibleUsers$`) y filtra con `isPortalRoleGroup` para que el dropdown
   * y el resolver de rol compartan el mismo criterio.
   */
  getAssignableGroups$(): Observable<Group[]> {
    return this.groupApi.listGroups({ size: LIST_PAGE_SIZE, page: 0 }).pipe(
      switchMap((first) => {
        if (first.totalPages <= 1) return of(first.items);
        const remainingPages = Array.from(
          { length: first.totalPages - 1 },
          (_, i) => i + 1,
        );
        return forkJoin(
          remainingPages.map((page) =>
            this.groupApi.listGroups({ size: LIST_PAGE_SIZE, page }),
          ),
        ).pipe(map((pages) => [...first.items, ...pages.flatMap((p) => p.items)]));
      }),
      map((groups) => groups.filter(isPortalRoleGroup)),
    );
  }

  /**
   * Los epersons sin grupo de rol del portal entran con role=null en lugar
   * de filtrarse: esconderlos dejaba usuarios irreparables desde la tabla y
   * un totalElements que contaba filas invisibles.
   */
  private mapPaginatedToUserViews(paginatedResult: Paginated<EPerson>): Paginated<UserView> {
    const items = paginatedResult.items
      .map((eperson) => this.resolveEPersonFromGroups(eperson, this.extractEmbeddedGroups(eperson)))
      .map((item) => this.assembleUserView(item));
    return { ...paginatedResult, items };
  }

  /**
   * Carga un target con sus grupos en paralelo. Se usa para los flujos que
   * inspeccionan el rol del target (cambio de rol, defensa en profundidad)
   * y necesitan un snapshot fresco, sin el cache del signal del caller.
   */
  private fetchEPersonWithGroups$(
    uuid: string,
  ): Observable<{ eperson: EPerson; groups: Group[] }> {
    return forkJoin({
      eperson: this.epersonApi.getOne(uuid),
      groups: this.groupApi.getGroupsOfEPerson(uuid).pipe(map((page) => page.items)),
    });
  }

  private resolveEPersonFromGroups(
    eperson: EPerson,
    groups: Group[],
  ): ResolvedEPersonOrOrphan {
    const role = resolveRoleFromGroups(groups);
    if (role === null) {
      return { eperson, role: null, subdivisionSuffix: null };
    }
    return { eperson, role, subdivisionSuffix: extractSubdivisionSuffix(groups) };
  }

  private extractEmbeddedGroups(eperson: EPerson): Group[] {
    return eperson._embedded?.groups?._embedded?.[EMBED_GROUPS] ?? [];
  }

  private assembleUserView(resolved: ResolvedEPersonOrOrphan): UserView {
    const eperson = resolved.eperson;
    return {
      uuid: eperson.uuid,
      email: eperson.email,
      firstName: eperson.metadata[METADATA_FIRSTNAME]?.[0]?.value ?? '',
      lastName: eperson.metadata[METADATA_LASTNAME]?.[0]?.value ?? '',
      role: resolved.role,
      subdivision: resolved.subdivisionSuffix,
      status: eperson.canLogIn ? 'active' : 'inactive',
      lastActive: eperson.lastActive,
    };
  }

  /**
   * Alta transaccional: POST eperson → POST uri-list al grupo destino → POST registrations.
   * Si la asignación al grupo falla, rollback con delete(uuid) para no dejar cuenta huérfana.
   * Un fallo del correo no revierte: la cuenta ya tiene rol y el reset se puede reenviar.
   */
  createUser$(input: CreateUserInput): Observable<EPerson> {
    if (!isAllowedEmailDomain(input.email, ALLOWED_EMAIL_DOMAINS)) {
      return throwError(
        () =>
          new BusinessRuleError(
            'EMAIL_INVALID',
            `El correo debe ser institucional (${ALLOWED_EMAIL_DOMAINS.join(', ')}).`,
          ),
      );
    }

    return this.getCallerContext$().pipe(
      switchMap((caller) => {
        const scopeError = this.validateCreateScope(caller, input);
        if (scopeError) return throwError(() => scopeError);

        return this.epersonApi.searchByEmail(input.email).pipe(
          switchMap((existing) => {
            if (existing) {
              return throwError(
                () =>
                  new BusinessRuleError(
                    'DUPLICATE_EMAIL',
                    'Ya existe un usuario con ese correo.',
                  ),
              );
            }
            return this.epersonApi
              .create({
                email: input.email,
                firstName: input.firstName,
                lastName: input.lastName,
              })
              .pipe(
                switchMap((created) =>
                  this.groupApi.addMemberToGroup(input.targetGroup.uuid, created.uuid).pipe(
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
      }),
    );
  }

  /**
   * Desactiva conmutando canLogIn a false. RN-11 (último superadmin), RN-12 (autodesactivación)
   * y RN-32 (alcance del admin de subdirección) corren antes de pegar al backend.
   */
  deactivateUser$(uuid: string): Observable<EPerson> {
    const currentUuid = this.authService.currentUser()?.uuid ?? null;
    if (currentUuid && uuid === currentUuid) {
      return throwError(
        () => new BusinessRuleError('SELF_DEACTIVATE', 'No puedes desactivarte a ti mismo.'),
      );
    }

    return this.assertWithinScope$(uuid).pipe(
      switchMap(() => this.groupApi.findAdministratorGroup()),
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

  /** Reactiva poniendo canLogIn=true. RN-32 sigue aplicando para admin_subdireccion. */
  reactivateUser$(uuid: string): Observable<EPerson> {
    return this.assertWithinScope$(uuid).pipe(
      switchMap(() => this.epersonApi.setActive(uuid, true)),
    );
  }

  /**
   * Cambio de grupo de un eperson existente. Solo superadmin (RN-13). Reconciliation
   * loop idempotente: lee los grupos actuales, salta el add si el target ya pertenece
   * al grupo destino, y limpia el resto de grupos de rol. Orden atómico add-antes-de-remove
   * para que un fallo del add no deje al target sin rol. Protege RN-27 (autocambio) y
   * RN-28 (último superadmin).
   */
  changeUserRole$(input: ChangeUserRoleInput): Observable<EPerson> {
    return this.getCallerContext$().pipe(
      switchMap((caller) => {
        if (!caller || !isSuperadmin(caller)) {
          return throwError(
            () =>
              new BusinessRuleError(
                'INSUFFICIENT_PRIVILEGES',
                'Solo un superadministrador puede cambiar roles.',
              ),
          );
        }

        if (caller.uuid === input.uuid) {
          return throwError(
            () => new BusinessRuleError('SELF_DEACTIVATE', 'No puedes cambiar tu propio rol.'),
          );
        }

        return this.fetchEPersonWithGroups$(input.uuid).pipe(
          switchMap(({ eperson: target, groups: targetGroups }) => {
            const targetIsAdmin = targetGroups.some(
              (group) => group.name === ADMINISTRATOR_GROUP_NAME,
            );
            const isDemotion =
              targetIsAdmin && input.newGroup.name !== ADMINISTRATOR_GROUP_NAME;

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

            // Si el target ya pertenece al grupo destino, saltar el add: evita
            // el 422 de DSpace por duplicate membership y que el rollback remueva
            // el grupo destino dejando al usuario sin rol.
            const alreadyInTarget = targetGroups.some(
              (group) => group.uuid === input.newGroup.uuid,
            );
            const add$: Observable<unknown> = alreadyInTarget
              ? of(undefined)
              : this.groupApi.addMemberToGroup(input.newGroup.uuid, target.uuid);

            return guard$.pipe(
              switchMap(() =>
                add$.pipe(
                  switchMap(() =>
                    this.removeFromPreviousRoleGroups$(target.uuid, targetGroups, input.newGroup.uuid).pipe(
                      catchError((removeErr: unknown) =>
                        alreadyInTarget
                          ? throwError(() => removeErr)
                          : this.rollbackAddToGroup$(input.newGroup.uuid, target.uuid, removeErr),
                      ),
                    ),
                  ),
                  map(() => target),
                ),
              ),
            );
          }),
        );
      }),
    );
  }

  /**
   * Edición diff de identidad (RN-30). Valida dominio si el correo cambia,
   * aplica `assertWithinScope$` como defensa, pre-verifica duplicado por
   * `searchByEmail` y emite un PATCH con solo los campos del diff. Si DSpace
   * aun así devuelve 422 por unicidad (carrera con otra edición concurrente,
   * o admin_subdireccion sin permiso para el search), el post-check mapea el
   * error a `DUPLICATE_EMAIL` para que el toast sea consistente entre roles.
   * Si el correo cambió y el target nunca activó (`lastActive === null`),
   * reenvía el registration al correo nuevo para que el link de fijación de
   * contraseña llegue al buzón correcto.
   */
  updateUser$(input: UpdateUserInput): Observable<EPerson> {
    const { uuid, changes } = input;

    if (changes.email !== undefined && !isAllowedEmailDomain(changes.email, ALLOWED_EMAIL_DOMAINS)) {
      return throwError(
        () =>
          new BusinessRuleError(
            'EMAIL_INVALID',
            `El correo debe ser institucional (${ALLOWED_EMAIL_DOMAINS.join(', ')}).`,
          ),
      );
    }

    return this.assertWithinScope$(uuid).pipe(
      switchMap(() => this.epersonApi.getOne(uuid)),
      switchMap((target) => {
        const emailChanging = changes.email !== undefined && changes.email !== target.email;
        const precheck$: Observable<void> = emailChanging
          ? this.epersonApi.searchByEmail(changes.email!).pipe(
              switchMap((existing) => {
                if (existing && existing.uuid !== uuid) {
                  return throwError(
                    () =>
                      new BusinessRuleError(
                        'DUPLICATE_EMAIL',
                        'Ya existe un usuario con ese correo.',
                      ),
                  );
                }
                return of<void>(undefined);
              }),
            )
          : of<void>(undefined);

        return precheck$.pipe(
          switchMap(() => this.epersonApi.update(uuid, changes)),
          catchError((err: unknown) => {
            if (err instanceof BusinessRuleError) return throwError(() => err);
            if (isDuplicateEmailError(err)) {
              return throwError(
                () =>
                  new BusinessRuleError(
                    'DUPLICATE_EMAIL',
                    'Ya existe un usuario con ese correo.',
                  ),
              );
            }
            return throwError(() => err);
          }),
          switchMap((updated) => {
            const emailChanged = changes.email !== undefined;
            const neverActivated = target.lastActive === null;
            if (emailChanged && neverActivated) {
              return this.epersonApi.resendRegistration(changes.email!).pipe(map(() => updated));
            }
            return of(updated);
          }),
        );
      }),
    );
  }

  /**
   * Reenvía el correo nativo de DSpace para que el target fije nueva contraseña.
   * El uuid viaja para resolver RN-31 (SELF_RESET) y RN-32 sin roundtrip extra.
   */
  resetPassword$(input: { uuid: string; email: string }): Observable<unknown> {
    const currentUuid = this.authService.currentUser()?.uuid ?? null;
    if (currentUuid && input.uuid === currentUuid) {
      return throwError(
        () =>
          new BusinessRuleError(
            'SELF_RESET',
            'Usa la opción "Olvidé mi contraseña" desde el login para restablecer la tuya.',
          ),
      );
    }
    return this.assertWithinScope$(input.uuid).pipe(
      switchMap(() => this.epersonApi.resendRegistration(input.email)),
    );
  }

  /**
   * RN-32: admin_subdireccion no opera sobre usuarios de otra subdirección. Compara
   * el sufijo de la subdivisión del caller con el del target (derivados del nombre
   * del grupo). Superadmin pasa sin roundtrip.
   */
  private assertWithinScope$(targetUuid: string): Observable<void> {
    return this.getCallerContext$().pipe(
      switchMap((caller) => {
        if (!caller) {
          return throwError(
            () =>
              new BusinessRuleError(
                'INSUFFICIENT_PRIVILEGES',
                'Sin permisos para operar sobre usuarios.',
              ),
          );
        }
        if (isSuperadmin(caller)) return of<void>(undefined);
        if (caller.role === 'admin_subdireccion') {
          return this.groupApi.getGroupsOfEPerson(targetUuid).pipe(
            switchMap((page) => {
              const targetSuffix = extractSubdivisionSuffix(page.items);
              if (targetSuffix !== caller.subdivisionSuffix) {
                return throwError(
                  () =>
                    new BusinessRuleError(
                      'OUT_OF_SCOPE',
                      'No puedes operar sobre usuarios fuera de tu subdirección.',
                    ),
                );
              }
              return of<void>(undefined);
            }),
          );
        }
        return throwError(
          () =>
            new BusinessRuleError(
              'INSUFFICIENT_PRIVILEGES',
              'Sin permisos para operar sobre usuarios.',
            ),
        );
      }),
    );
  }

  /**
   * Lee el caller del cache compartido de `currentUserView$`. No dispara HTTP
   * si ya hay un suscriptor vivo (la pantalla de admin, el topbar, el menú).
   * Orfandad de rol se reduce a `null` para que los consumidores decidan el
   * BusinessRuleError apropiado en cada mutación.
   */
  private getCallerContext$(): Observable<CallerContext | null> {
    return this.currentUserView$.pipe(
      take(1),
      map((view) =>
        view && view.role !== null
          ? { uuid: view.uuid, role: view.role, subdivisionSuffix: view.subdivision }
          : null,
      ),
      catchError(() => of<CallerContext | null>(null)),
    );
  }

  /**
   * RN-08 + RN-13 al crear: admin_subdireccion solo puede crear personal delegado
   * (grupos SUBMITTERS_*) dentro de su misma subdirección (mismo sufijo). Cualquier
   * otro combo se corta con INSUFFICIENT_PRIVILEGES.
   */
  private validateCreateScope(
    caller: CallerContext | null,
    input: CreateUserInput,
  ): BusinessRuleError | null {
    if (!caller) {
      return new BusinessRuleError('INSUFFICIENT_PRIVILEGES', 'Sin permisos para crear usuarios.');
    }
    if (isSuperadmin(caller)) return null;
    if (caller.role === 'admin_subdireccion') {
      const targetName = input.targetGroup.name;
      if (!targetName.startsWith('SUBMITTERS_')) {
        return new BusinessRuleError(
          'INSUFFICIENT_PRIVILEGES',
          'Un admin de subdirección solo puede crear personal delegado.',
        );
      }
      const targetSuffix = targetName.slice('SUBMITTERS_'.length);
      if (targetSuffix !== caller.subdivisionSuffix) {
        return new BusinessRuleError(
          'INSUFFICIENT_PRIVILEGES',
          'Solo puedes crear usuarios dentro de tu subdirección.',
        );
      }
      return null;
    }
    return new BusinessRuleError('INSUFFICIENT_PRIVILEGES', 'Sin permisos para crear usuarios.');
  }

  private rollbackCreatedEPerson$(uuid: string, originalError: unknown): Observable<never> {
    return this.epersonApi.delete(uuid).pipe(
      catchError(() => of(undefined)),
      switchMap(() => throwError(() => originalError)),
    );
  }

  /**
   * Retira al eperson de los grupos de rol del portal que tenía antes del
   * cambio, excluyendo el grupo nuevo. Dispara todas las removes en paralelo
   * y espera a que todas completen (cada attempt captura su propio error
   * como valor), para que ninguna quede cancelada a medio camino. Si alguna
   * falla, re-emite el primer error como señal para el rollback en
   * `changeUserRole$`; los grupos no-rol (Anonymous, COMMUNITY_*_ADMIN) no
   * se tocan.
   */
  private removeFromPreviousRoleGroups$(
    epersonUuid: string,
    previousGroups: Group[],
    keepGroupUuid: string,
  ): Observable<unknown> {
    const toRemove = previousGroups.filter(
      (group) => isPortalRoleGroup(group) && group.uuid !== keepGroupUuid,
    );
    if (toRemove.length === 0) return of(undefined);
    const attempts$ = toRemove.map((group) =>
      this.groupApi.removeMemberFromGroup(group.uuid, epersonUuid).pipe(
        map<unknown, unknown>(() => null),
        catchError((err: unknown) => of(err)),
      ),
    );
    return forkJoin(attempts$).pipe(
      switchMap((results) => {
        const firstError = results.find((r) => r !== null);
        return firstError !== undefined ? throwError(() => firstError) : of(undefined);
      }),
    );
  }

  /**
   * Compensa el `addMemberToGroup` del cambio de rol cuando una remove
   * posterior falla: quita al target del grupo nuevo para volver al estado
   * previo. El propio rollback corre con `catchError` best-effort para no
   * ocultar el error original si el rollback también falla; en ese caso
   * extremo el estado queda parcial pero el usuario ve el error relevante.
   */
  private rollbackAddToGroup$(
    groupUuid: string,
    epersonUuid: string,
    originalError: unknown,
  ): Observable<never> {
    return this.groupApi.removeMemberFromGroup(groupUuid, epersonUuid).pipe(
      catchError(() => of(undefined)),
      switchMap(() => throwError(() => originalError)),
    );
  }
}

/**
 * Heurística para detectar el 422 de DSpace cuando rechaza por unicidad del
 * correo. Cubre el caso de carrera (otra edición concurrente creó un duplicado
 * entre el pre-check y el PATCH) y el caso de admin_subdireccion cuyo
 * `searchByEmail` devolvió null porque el 403 fue tragado.
 */
function isDuplicateEmailError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; error?: { message?: string } | string };
  if (e.status !== 422) return false;
  const body = e.error;
  const message = typeof body === 'string' ? body : (body?.message ?? '');
  return /email/i.test(message);
}
