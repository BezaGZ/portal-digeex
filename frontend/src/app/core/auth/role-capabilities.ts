import { Caller } from './caller.model';
import { UserRole } from './user-role.model';

/**
 * Capacidades por rol del portal, como funciones puras. Viven en core/auth para
 * que pantallas, guards y servicios deriven la misma decisión sin reimplementar
 * la comparación de rol ni importar de una feature.
 */

/**
 * Lo mínimo que un predicado de rol necesita: cualquier objeto con rol del
 * portal. Lo cumplen tanto `Caller` (rol ya resuelto) como `UserView` (rol que
 * puede ser null para un eperson sin grupo).
 */
export type RoleHolder = { role: UserRole | null };

/** Caller del grupo Administrator (RN-07): control total, sin scope acotado. */
export function isSuperadmin(holder: RoleHolder | null): boolean {
  return holder?.role === 'superadmin';
}

/** RN-40: la estructura top-level es exclusiva del superadmin. */
export function canCreateTopLevel(holder: RoleHolder | null): boolean {
  return isSuperadmin(holder);
}

/** El superadmin elige cualquier sub; el resto queda atado a su sufijo. */
export function canChooseAnySubdireccion(holder: RoleHolder | null): boolean {
  return isSuperadmin(holder);
}

/** RN-13: solo el superadmin cambia el rol de un usuario. */
export function canModifyRoles(holder: RoleHolder | null): boolean {
  return isSuperadmin(holder);
}

/**
 * Solo quien puede ver un item privado puede ponerlo privado: el delegado no
 * accede a Recursos (administrativeView) y el filtro nativo de discovery
 * (SolrServicePrivateItemPlugin) le oculta los privados también en Mis envíos.
 */
export function canToggleItemVisibility(holder: RoleHolder | null): boolean {
  return holder?.role === 'superadmin' || holder?.role === 'admin_subdireccion';
}

/**
 * El caller está acotado a una sub: existe, no es superadmin y el backend le
 * afirmó un scope. Es la condición previa a resolver su subdirección concreta.
 */
export function isCallerScoped(caller: Caller | null): boolean {
  return caller !== null && !isSuperadmin(caller) && caller.scopeUuid !== null;
}

/**
 * Hay scope con el que renderizar: el superadmin siempre (opera global); el
 * resto necesita un uuid de sub ya resuelto. `undefined` es "aún cargando" y
 * no cuenta. Fail-closed: sin caller, false.
 */
export function hasUsableScope(
  caller: Caller | null,
  scope: string | null | undefined,
): boolean {
  if (caller === null || scope === undefined) {
    return false;
  }
  if (isSuperadmin(caller)) {
    return true;
  }
  return typeof scope === 'string';
}
