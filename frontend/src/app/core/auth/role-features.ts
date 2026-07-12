import { UserRole } from './user-role.model';

/**
 * Respuestas del backend a las cuatro features de Site que determinan el rol
 * del portal (`/api/authz/authorizations/search/object`).
 */
export interface RoleFeatureFlags {
  administratorOf: boolean;
  isCommunityAdmin: boolean;
  isCollectionAdmin: boolean;
  canSubmit: boolean;
}

/**
 * Deriva el rol del portal desde las features de autorización, con la misma
 * precedencia que la derivación por nombre de grupo (superadmin >
 * admin_subdireccion > personal_delegado). La precedencia es obligatoria
 * porque las features se solapan: el superadmin da verdadero en las cuatro.
 */
export function mapFeaturesToRole(flags: RoleFeatureFlags): UserRole | null {
  if (flags.administratorOf) return 'superadmin';
  if (flags.isCommunityAdmin) return 'admin_subdireccion';
  if (flags.isCollectionAdmin || flags.canSubmit) return 'personal_delegado';
  return null;
}
