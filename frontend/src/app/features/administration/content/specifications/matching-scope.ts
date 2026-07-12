import { ScopeContext, ScopeSpecification } from './scope-context.model';
import { isSuperadmin } from '../../../../core/auth/role-capabilities';

/**
 * RN-32 + RN-41: para recursos asociados a una subdirección, el caller debe
 * estar en la misma subdirección que el recurso, comparando los uuids de
 * scope afirmados por el backend. SuperAdmin pasa siempre. Para recursos de
 * la community raíz, esta regla no opina. Sin scope de alguno de los dos
 * lados, rechaza (fail-closed).
 */
export class MatchingScopeSpec implements ScopeSpecification {
  isSatisfiedBy(context: ScopeContext): boolean {
    if (isSuperadmin(context.caller)) {
      return true;
    }
    if (context.dsoType === 'community-toplevel') {
      return true;
    }
    return (
      context.resourceScopeUuid !== null &&
      context.caller.scopeUuid === context.resourceScopeUuid
    );
  }

  rejectionMessage(context: ScopeContext): string {
    return `El caller con rol ${context.caller.role} y scope ${context.caller.scopeUuid ?? 'ninguno'} no puede operar sobre un recurso de la subdirección ${context.resourceScopeUuid ?? 'desconocida'}.`;
  }
}
