import { Community } from '../../../../core/api/models/community.model';
import { Caller } from '../../content/specifications/scope-context.model';
import { isSuperadmin } from '../../../../core/auth/role-capabilities';

/**
 * Resuelve la subdirección que el caller tiene scopeada, por el uuid que el
 * backend le afirmó. Función pura, sin signals ni HTTP: las pantallas del
 * admin la consumen para derivar la sub del caller sin duplicar el matching.
 *
 *  - superadmin: null (no está acotado a una sub; elige libre)
 *  - resto: la sub cuyo uuid coincide con `caller.scopeUuid`; null si el
 *    backend no devolvió scope o el uuid no está en la lista (fail-closed)
 *  - caller null: null
 */
export function findCallerSub(
  subs: Community[],
  caller: Caller | null,
): Community | null {
  if (!caller || isSuperadmin(caller)) {
    return null;
  }
  return subs.find((s) => s.uuid === caller.scopeUuid) ?? null;
}
