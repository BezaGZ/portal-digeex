import { Group } from '../../../../core/api/models/group.model';
import { extractUuidFromHref } from '../../../../core/api/dspace-rest.util';
import { UserRole } from '../models/user-view.model';

/**
 * Nombre del grupo global de DSpace que otorga control total (RN-07).
 * Es una constante del producto: DSpace crea este grupo con ese nombre
 * exacto durante la instalación y no se renombra en nuestra instancia.
 */
const ADMINISTRATOR_GROUP_NAME = 'Administrator';

/**
 * Fragmentos del href de `_links.object` que identifican el tipo de DSO
 * dueño del grupo. Los usamos como discriminador en lugar del nombre
 * del grupo porque DSpace garantiza la forma del URL (/core/communities/
 * y /core/collections/), pero no impone un patrón de nombres para los
 * grupos de adminGroup y submittersGroup.
 */
const COMMUNITY_OBJECT_PATH = '/core/communities/';
const COLLECTION_OBJECT_PATH = '/core/collections/';

/**
 * Deriva el rol del sistema a partir de los grupos de DSpace a los que
 * pertenece el eperson.
 *
 * Fuente de verdad: los grupos devueltos por GET /api/eperson/epersons/{uuid}/groups.
 * Esta función es pura — no habla con HTTP, recibe los grupos ya cargados.
 *
 * Reglas del mapeo y precedencia (RN-07, RN-08, RN-13):
 *  - Grupo global "Administrator"                   → superadmin
 *  - _links.object.href apunta a /core/communities/ → admin_subdireccion
 *  - _links.object.href apunta a /core/collections/ → personal_delegado
 *  - Ningún grupo aplica                            → null
 *
 * El orden de los chequeos implementa la precedencia declarada en el
 * spec: `superadmin` > `admin_subdireccion` > `personal_delegado`. En
 * cuanto un nivel aplica, los siguientes se saltan.
 *
 * Ciclo 9 — Sprint 5.
 */
export function resolveRoleFromGroups(groups: Group[]): UserRole | null {
  if (groups.some((group) => group.name === ADMINISTRATOR_GROUP_NAME)) {
    return 'superadmin';
  }

  if (groups.some((group) => group._links.object.href.includes(COMMUNITY_OBJECT_PATH))) {
    return 'admin_subdireccion';
  }

  if (groups.some((group) => group._links.object.href.includes(COLLECTION_OBJECT_PATH))) {
    return 'personal_delegado';
  }

  return null;
}

/**
 * Devuelve el uuid de la community dueña del primer grupo con _links.object
 * apuntando a /core/communities/. Se usa junto con resolveRoleFromGroups
 * para mapear admin_subdireccion al nombre legible de la subdivisión.
 */
export function extractOwningCommunityUuid(groups: Group[]): string | null {
  for (const group of groups) {
    const href = group._links?.object?.href;
    if (href && href.includes(COMMUNITY_OBJECT_PATH)) {
      return extractUuidFromHref(href);
    }
  }
  return null;
}
