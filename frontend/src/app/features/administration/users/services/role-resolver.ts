import { Group } from '../../../../core/api/models/group.model';
import { UserRole } from '../models/user-view.model';

/** Grupo global built-in de DSpace; control total del portal (RN-07). */
export const ADMINISTRATOR_GROUP_NAME = 'Administrator';

/**
 * Prefijos con los que el setup nombra los grupos del portal por subdirección.
 * Cualquier grupo que empiece con estos prefijos se trata como rol del portal;
 * el sufijo identifica la subdirección. Todo dinámico — una subdirección nueva
 * aparece con solo crear `ADMIN_{SUFIJO}` y `SUBMITTERS_{SUFIJO}` en DSpace.
 */
export const ADMIN_GROUP_NAME_PREFIX = 'ADMIN_';
export const SUBMITTERS_GROUP_NAME_PREFIX = 'SUBMITTERS_';

/**
 * Deriva el rol por nombre del grupo (precedencia superadmin > admin_subdireccion
 * > personal_delegado). No usa `_links.object` porque está vacío en 9.2 para los
 * grupos custom creados vía PUT al subrecurso.
 */
export function resolveRoleFromGroups(groups: Group[]): UserRole | null {
  if (groups.some((g) => g.name === ADMINISTRATOR_GROUP_NAME)) return 'superadmin';
  if (groups.some((g) => g.name.startsWith(ADMIN_GROUP_NAME_PREFIX))) return 'admin_subdireccion';
  if (groups.some((g) => g.name.startsWith(SUBMITTERS_GROUP_NAME_PREFIX))) {
    return 'personal_delegado';
  }
  return null;
}

/**
 * Sufijo de subdivisión del primer grupo ADMIN_* o SUBMITTERS_* del eperson.
 * Ej: "ADMIN_ED_BASICA" → "ED_BASICA". Permite que `assertWithinScope$` compare
 * alcance entre caller y target sin tablas hardcoded ni seguimiento de links.
 */
export function extractSubdivisionSuffix(groups: Group[]): string | null {
  for (const g of groups) {
    if (g.name.startsWith(ADMIN_GROUP_NAME_PREFIX)) {
      return g.name.slice(ADMIN_GROUP_NAME_PREFIX.length);
    }
    if (g.name.startsWith(SUBMITTERS_GROUP_NAME_PREFIX)) {
      return g.name.slice(SUBMITTERS_GROUP_NAME_PREFIX.length);
    }
  }
  return null;
}

/**
 * True si el grupo representa un rol del portal. Usado por el dropdown de
 * alta y por el resolver de rol para ignorar grupos nativos de DSpace
 * (Anonymous, COMMUNITY_{uuid}_ADMIN, COLLECTION_{uuid}_SUBMIT, etc.).
 */
export function isPortalRoleGroup(group: Group): boolean {
  return (
    group.name === ADMINISTRATOR_GROUP_NAME ||
    group.name.startsWith(ADMIN_GROUP_NAME_PREFIX) ||
    group.name.startsWith(SUBMITTERS_GROUP_NAME_PREFIX)
  );
}
