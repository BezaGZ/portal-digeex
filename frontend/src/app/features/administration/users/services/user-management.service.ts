import { Injectable, signal, computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';

import { UserView, UserRole, UserStatus } from '../models/user-view.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { EPersonApiService } from '../../../../core/api/eperson-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { DSpaceApiService } from '../../../../core/api/dspace-api.service';
import { EPerson } from '../../../../core/api/models/eperson.model';
import { Group } from '../../../../core/api/models/group.model';
import { Paginated } from '../../../../core/api/models/hal.model';
import { extractOwningCommunityUuid, resolveRoleFromGroups } from './role-resolver';

/** Proyección que DSpace usa para anidar los grupos dentro del eperson. */
const EMBED_GROUPS = 'groups';

/** Clave del subrecurso `groups` dentro del _embedded del eperson. */
const METADATA_FIRSTNAME = 'eperson.firstname';
const METADATA_LASTNAME = 'eperson.lastname';

/**
 * Servicio para gestión de usuarios del panel administrativo.
 * Maneja CRUD de usuarios con validaciones de negocio (máximo 2 superadmins,
 * correo @mineduc.gob.gt obligatorio, subdirección requerida para no-superadmin).
 * Actualmente usa datos en memoria; se conectará a DSpace EPerson API.
 */
@Injectable({
  providedIn: 'root',
})
export class UserManagementService {
  /**
   * Dependencias del facade real (Ciclos 10 a 12). Se inyectan desde ya
   * aunque los miembros nuevos todavía son stubs: así el GREEN solo tiene
   * que reemplazar cuerpos, sin refactorizar el injection context.
   */
  private readonly authService = inject(AuthService);
  private readonly epersonApi = inject(EPersonApiService);
  private readonly groupApi = inject(GroupApiService);
  private readonly dspaceApi = inject(DSpaceApiService);

  /**
   * Vista del usuario logueado con su rol ya resuelto. Pide el eperson
   * con `?embed=groups` para traer los grupos en una sola llamada y
   * deriva el rol con resolveRoleFromGroups; si el rol viene de una
   * community, también resuelve el nombre legible de la subdivisión.
   * Se cachea con shareReplay para que getVisibleUsers$ no la repita.
   */
  readonly currentUserView$: Observable<UserView | null> = toObservable(this.authService.currentUser).pipe(
    switchMap((authUser) => {
      if (!authUser) return of<UserView | null>(null);
      return this.epersonApi
        .getOne(authUser.uuid, { embed: EMBED_GROUPS })
        .pipe(switchMap((eperson) => this.toUserView(eperson)));
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Listado paginado de usuarios visibles para el caller. Combina el
   * listado de epersons (con embed=groups, una sola petición) con el
   * resolver de rol/subdivisión por usuario; si el caller es
   * admin_subdireccion, filtra del lado cliente porque DSpace no
   * expone "epersons por community".
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
   * Mapea cada EPerson de una página a su UserView correspondiente y
   * aplica el filtro de alcance del caller. Si la página viene vacía
   * se cortocircuita para no disparar un forkJoin sobre [].
   */
  private mapPaginatedToUserViews(
    paginatedResult: Paginated<EPerson>,
    currentUser: UserView | null,
  ): Observable<Paginated<UserView>> {
    if (paginatedResult.items.length === 0) {
      return of({ ...paginatedResult, items: [] });
    }

    return forkJoin(paginatedResult.items.map((eperson) => this.toUserView(eperson))).pipe(
      map((userViews) => {
        const valid = userViews.filter((view): view is UserView => view !== null);
        const filtered = this.applyCallerScope(valid, currentUser);
        return { ...paginatedResult, items: filtered };
      }),
    );
  }

  /**
   * Convierte un EPerson (con grupos embebidos) en su UserView. Si el
   * rol es admin_subdireccion, busca la community dueña del grupo para
   * exponer el nombre legible como subdivisión. Si resolveRoleFromGroups
   * no encuentra nada aplicable, devuelve null para que el caller pueda
   * descartarlo del listado o tratar la sesión como inválida.
   */
  private toUserView(eperson: EPerson): Observable<UserView | null> {
    const groups = this.extractEmbeddedGroups(eperson);
    const role = resolveRoleFromGroups(groups);
    if (role === null) return of(null);

    const communityUuid =
      role === 'admin_subdireccion' ? extractOwningCommunityUuid(groups) : null;

    const subdivision$ = communityUuid
      ? this.dspaceApi.getCommunity(communityUuid).pipe(map((community) => community.name))
      : of<string | null>(null);

    return subdivision$.pipe(
      map((subdivision) => this.assembleUserView(eperson, role, subdivision)),
    );
  }

  /**
   * Devuelve los grupos anidados en `_embedded.groups._embedded.groups`
   * cuando la petición usó embed=groups. Centralizado acá para no
   * desparramar la navegación de la estructura HAL por el resto del facade.
   */
  private extractEmbeddedGroups(eperson: EPerson): Group[] {
    return eperson._embedded?.groups?._embedded?.[EMBED_GROUPS] ?? [];
  }

  /**
   * Construye el UserView final a partir del EPerson y los datos ya
   * resueltos. Lee firstname/lastname desde metadata (la forma canónica
   * de DSpace) y mapea canLogIn al status que entiende el UI.
   */
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

  /**
   * Aplica el alcance del caller al listado: el admin_subdireccion solo
   * ve usuarios de su misma subdivisión (RN-08). El superadmin ve todo.
   * Cualquier otro rol devuelve lista vacía por defecto, que es lo
   * conservador hasta que se especifique otro caso de uso.
   */
  private applyCallerScope(userViews: UserView[], currentUser: UserView | null): UserView[] {
    if (!currentUser) return [];
    if (currentUser.role === 'superadmin') return userViews;
    if (currentUser.role === 'admin_subdireccion') {
      return userViews.filter((view) => view.subdivision === currentUser.subdivision);
    }
    return [];
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
