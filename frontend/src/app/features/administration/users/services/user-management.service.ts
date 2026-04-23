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
import { Paginated } from '../../../../core/api/models/hal.model';
import {
  ADMINISTRATOR_GROUP_NAME,
  extractSubdivisionSuffix,
  isPortalRoleGroup,
  resolveRoleFromGroups,
} from './role-resolver';
import { BusinessRuleError } from './business-rule-error';

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

/** Proyección HAL `embed=groups` del listado paginado `/api/eperson/epersons`. */
const EMBED_GROUPS = 'groups';

/** Claves del metadata canónico de DSpace para primer y último nombre. */
const METADATA_FIRSTNAME = 'eperson.firstname';
const METADATA_LASTNAME = 'eperson.lastname';

/** Dominio institucional exigido por RN-02. */
const INSTITUTIONAL_EMAIL_DOMAIN = '@mineduc.gob.gt';

/**
 * Tope por página al traer listas de DSpace. 100 es el máximo aceptado por el
 * backend en una sola respuesta; los listados completos (epersons, groups) se
 * arman pidiendo la primera página y después el resto en paralelo hasta cubrir
 * `totalPages`.
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
   * de grupo. `refCount: false` mantiene la suscripción interna viva mientras
   * viva el servicio (singleton), para que dos consumidores en momentos
   * distintos de la app (login → Users container → mutación) compartan la
   * misma emisión sin refetches.
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
          return of(this.assembleUserView(resolved));
        }),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /**
   * Listado completo de epersons con su rol resuelto. Trae todas las páginas
   * del backend en paralelo para que el `p-table` tenga el dataset entero y
   * su paginación + filtrado cliente sigan funcionando a cualquier escala.
   * Solo lo consume el panel reservado al site admin; `/api/eperson/epersons`
   * exige `hasAuthority('ADMIN')` en DSpace 9.2.
   */
  getVisibleUsers$(): Observable<Paginated<UserView>> {
    return this.epersonApi
      .list({ size: LIST_PAGE_SIZE, page: 0, embed: EMBED_GROUPS })
      .pipe(
        switchMap((first) => {
          if (first.totalPages <= 1) return of(first);
          const remainingPages = Array.from(
            { length: first.totalPages - 1 },
            (_, i) => i + 1,
          );
          return forkJoin(
            remainingPages.map((page) =>
              this.epersonApi.list({ size: LIST_PAGE_SIZE, page, embed: EMBED_GROUPS }),
            ),
          ).pipe(
            map((pages) => ({
              ...first,
              items: [...first.items, ...pages.flatMap((p) => p.items)],
            })),
          );
        }),
        map((combined) => this.mapPaginatedToUserViews(combined)),
      );
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

  private mapPaginatedToUserViews(paginatedResult: Paginated<EPerson>): Paginated<UserView> {
    const items = paginatedResult.items
      .map((eperson) => this.resolveEPersonFromGroups(eperson, this.extractEmbeddedGroups(eperson)))
      .filter((item): item is ResolvedEPerson => item.role !== null)
      .map((item) => this.assembleUserView(item));
    return { ...paginatedResult, items };
  }

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

  private assembleUserView(resolved: ResolvedEPerson): UserView {
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
    if (!input.email.endsWith(INSTITUTIONAL_EMAIL_DOMAIN)) {
      return throwError(
        () =>
          new BusinessRuleError(
            'EMAIL_INVALID',
            `El correo debe ser institucional (${INSTITUTIONAL_EMAIL_DOMAIN}).`,
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
   * Cambio de grupo de un eperson existente. Solo superadmin (RN-13). Orden atómico:
   * add al nuevo antes de remove de los previos, para que un fallo del add no deje
   * al target sin grupo de rol. Protege RN-27 (autocambio) y RN-28 (último superadmin).
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

            return guard$.pipe(
              switchMap(() =>
                this.groupApi.addMemberToGroup(input.newGroup.uuid, target.uuid).pipe(
                  switchMap(() => this.removeFromPreviousRoleGroups$(target.uuid, targetGroups, input.newGroup.uuid)),
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

    if (changes.email !== undefined && !changes.email.endsWith(INSTITUTIONAL_EMAIL_DOMAIN)) {
      return throwError(
        () =>
          new BusinessRuleError(
            'EMAIL_INVALID',
            `El correo debe ser institucional (${INSTITUTIONAL_EMAIL_DOMAIN}).`,
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
        if (caller.role === 'superadmin') return of<void>(undefined);
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
        view
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
    if (caller.role === 'superadmin') return null;
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
   * Retira al eperson de los grupos de rol del portal que tenía antes del cambio,
   * excluyendo el grupo nuevo (si lo tenía doble, no lo quitamos). Los grupos no-rol
   * (Anonymous, COMMUNITY_*_ADMIN, etc.) no se tocan.
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
    return forkJoin(
      toRemove.map((group) => this.groupApi.removeMemberFromGroup(group.uuid, epersonUuid)),
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
