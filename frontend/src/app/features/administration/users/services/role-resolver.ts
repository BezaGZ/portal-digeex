import { Group } from '../../../../core/api/models/group.model';
import { UserRole } from '../models/user-view.model';

/**
 * Deriva el rol del sistema a partir de los grupos de DSpace a los que
 * pertenece el eperson.
 *
 * Fuente de verdad: los grupos devueltos por GET /api/eperson/epersons/{uuid}/groups.
 * Esta función es pura — no habla con HTTP, recibe los grupos ya cargados.
 *
 * Reglas del mapeo (RN-07, RN-08, RN-13):
 *  - Grupo global "Administrator"                   → superadmin
 *  - _links.object.href apunta a /core/communities/ → admin_subdireccion
 *  - _links.object.href apunta a /core/collections/ → personal_delegado
 *  - Ningún grupo aplica                            → null
 *  - Superadmin prevalece si coexiste con otros
 *  - admin_subdireccion prevalece sobre personal_delegado
 *
 * Ciclo 9 — Sprint 5.
 *
 * Stub intencionalmente incompleto: siempre devuelve null para que los
 * asserts positivos del spec fallen. La implementación real va en GREEN.
 */
export function resolveRoleFromGroups(_groups: Group[]): UserRole | null {
  return null;
}
