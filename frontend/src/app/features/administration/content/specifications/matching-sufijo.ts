import { ScopeContext, ScopeSpecification } from './scope-context.model';
import { isSuperadmin } from '../../../../core/auth/role-capabilities';

/**
 * RN-32 + RN-41: para recursos asociados a una subdirección, el caller debe
 * estar en la misma subdirección que el recurso. SuperAdmin pasa siempre.
 * Para recursos de la community raíz, esta regla no opina.
 */
export class MatchingSufijoSpec implements ScopeSpecification {
  isSatisfiedBy(context: ScopeContext): boolean {
    if (isSuperadmin(context.caller)) {
      return true;
    }
    if (context.dsoType === 'community-toplevel') {
      return true;
    }
    return (
      context.resourceSufijo !== null &&
      context.caller.sufijo === context.resourceSufijo
    );
  }

  rejectionMessage(context: ScopeContext): string {
    return `El caller con rol ${context.caller.role} y sufijo ${context.caller.sufijo ?? 'ninguno'} no puede operar sobre un recurso de la subdirección ${context.resourceSufijo ?? 'desconocida'}.`;
  }
}
