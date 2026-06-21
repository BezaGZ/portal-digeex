import { UserRole } from './user-role.model';

/**
 * Scopes de rol nominados que consumen `roleGuard` (en `app.routes.ts`) y la
 * matriz declarativa del menú admin (`admin-menu.config.ts`). Centralizar las
 * combinaciones acá deja una sola fuente de verdad: si un rol nuevo entra a
 * un scope, se cambia la constante y ambos lugares lo heredan, sin riesgo de
 * desalinear la matriz de visibilidad del sidebar con la de autorización de
 * rutas (RN-32, RN-41).
 *
 * `ALL_AUTHENTICATED` no se aplica como `roleGuard`: las rutas con visibilidad
 * universal entre roles del portal solo declaran `authGuard` y se omiten del
 * factory de rol; el valor existe para la matriz del menú, que sí necesita
 * marcar "se ve para cualquier sesión válida".
 */
export const ROLE_SCOPES = {
  SUPERADMIN_ONLY: ['superadmin'] as UserRole[],
  ADMIN: ['superadmin', 'admin_subdireccion'] as UserRole[],
  STAFF: ['superadmin', 'admin_subdireccion', 'personal_delegado'] as UserRole[],
} as const;

/** Sentinel para items del menú visibles a cualquier sesión autenticada. */
export const SCOPE_ANY_AUTHENTICATED = 'all' as const;

export type MenuScope = readonly UserRole[] | typeof SCOPE_ANY_AUTHENTICATED;
