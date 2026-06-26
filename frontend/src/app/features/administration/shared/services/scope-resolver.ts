import { Community } from '../../../../core/api/models/community.model';
import { Caller } from '../../content/specifications/scope-context.model';
import { isSuperadmin } from '../../../../core/auth/role-capabilities';

const SUFIJO_METADATA_FIELD = 'digeex.sufijo';

/**
 * Resuelve la subdirección que el caller tiene scopeada según su sufijo.
 * Función pura, sin dependencias de signals ni HTTP: las pantallas del admin
 * la consumen para derivar la sub del caller sin duplicar la lógica de
 * matching por sufijo.
 *
 *  - superadmin: null (no está acotado a una sub; elige libre)
 *  - admin_subdireccion: la sub cuyo digeex.sufijo coincide con el del caller
 *  - personal_delegado: igual que admin_subdireccion (mismo modelo de scope)
 *  - caller null o sin sufijo: null
 *  - sufijo del caller no matchea ninguna sub: null
 */
export function findCallerSub(
  subs: Community[],
  caller: Caller | null,
): Community | null {
  if (!caller || !caller.sufijo || isSuperadmin(caller)) {
    return null;
  }
  return (
    subs.find(
      (s) => s.metadata?.[SUFIJO_METADATA_FIELD]?.[0]?.value === caller.sufijo,
    ) ?? null
  );
}
