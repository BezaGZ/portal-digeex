export type UserRole =
  | 'superadmin'
  | 'admin_subdireccion'
  | 'personal_delegado';
export type UserStatus = 'active' | 'inactive';

export interface UserView {
  uuid: string;
  email: string;
  firstName: string;
  lastName: string;
  /** null = eperson sin grupo de rol del portal (huérfano reparable desde la tabla). */
  role: UserRole | null;
  subdivision: string | null;
  status: UserStatus;
  lastActive: string | null;
}

export const RoleLabels: Record<UserRole, string> = {
  superadmin: 'Superadministrador',
  admin_subdireccion: 'Admin. Subdirección',
  personal_delegado: 'Personal Delegado',
};
