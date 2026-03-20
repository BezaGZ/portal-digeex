import { Injectable, signal, computed } from '@angular/core';
import { UserView, UserRole, UserStatus } from '../models/user-view.model';

@Injectable({
  providedIn: 'root',
})
export class UserManagementService {
  private usersSignal = signal<UserView[]>([
    {
      uuid: '1a2b3c4d-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
      email: 'carlos.ramirez@mineduc.gob.gt',
      firstName: 'Carlos',
      lastName: 'Ramírez',
      role: 'superadmin',
      subdivision: null,
      status: 'active',
      requiresPasswordChange: false,
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
      requiresPasswordChange: false,
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
      requiresPasswordChange: false,
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
      requiresPasswordChange: false,
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
      requiresPasswordChange: false,
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
      requiresPasswordChange: true,
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
      requiresPasswordChange: false,
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
      requiresPasswordChange: false,
      lastActive: '2026-02-13T08:45:00Z',
    },
  ]);

  users = this.usersSignal.asReadonly();

  private currentUserSignal = signal<UserView>(this.usersSignal()[0]);
  currentUser = this.currentUserSignal.asReadonly();

  activeSuperadminsCount = computed(() => {
    return this.usersSignal().filter((u) => u.role === 'superadmin' && u.status === 'active')
      .length;
  });

  canCreateSuperadmin = computed(() => this.activeSuperadminsCount() < 2);

  validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email.endsWith('@mineduc.gob.gt')) {
      return { valid: false, error: 'El correo debe terminar en @mineduc.gob.gt' };
    }
    return { valid: true };
  }

  emailExistsAsActive(email: string, excludeUuid?: string): boolean {
    return this.usersSignal().some(
      (u) => u.email === email && u.status === 'active' && u.uuid !== excludeUuid,
    );
  }

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
      requiresPasswordChange: true,
      lastActive: null,
    };

    this.usersSignal.update((users) => [...users, newUser]);

    return { success: true, user: newUser };
  }

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
      users.map((u) =>
        u.uuid === uuid
          ? { ...u, status: 'active' as UserStatus, requiresPasswordChange: true }
          : u,
      ),
    );

    return { success: true };
  }

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

  resetPassword(uuid: string): { success: boolean; error?: string } {
    const user = this.usersSignal().find((u) => u.uuid === uuid);

    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    this.usersSignal.update((users) =>
      users.map((u) => (u.uuid === uuid ? { ...u, requiresPasswordChange: true } : u)),
    );

    return { success: true };
  }

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

  getDefaultSubdivision(): string | null {
    const current = this.currentUser();

    if (current.role === 'admin_subdireccion') {
      return current.subdivision;
    }

    return null;
  }

  canModifyRoles(): boolean {
    return this.currentUser().role === 'superadmin';
  }
}
