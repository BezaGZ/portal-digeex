export type UserRole =
  | 'superadmin'
  | 'admin_subdireccion'
  | 'personal_delegado'
  | 'sin_asignar';
export type UserStatus = 'active' | 'inactive';

export interface UserView {
  uuid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  subdivision: string | null;
  status: UserStatus;
  lastActive: string | null;
}

export const RoleLabels: Record<UserRole, string> = {
  superadmin: 'Superadministrador',
  admin_subdireccion: 'Admin. Subdirección',
  personal_delegado: 'Personal Delegado',
  sin_asignar: 'Sin asignar',
};

export const Subdivisions = [
  'Educación Básica',
  'Educación para el Trabajo y la Cultura',
  'Investigación y Proyectos Educativos',
] as const;

export type Subdivision = (typeof Subdivisions)[number];
