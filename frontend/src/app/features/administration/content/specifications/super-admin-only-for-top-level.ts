import { ScopeContext, ScopeSpecification } from './scope-context.model';
import { isSuperadmin } from '../../../../core/auth/role-capabilities';

/**
 * RN-40: solo SuperAdmin puede operar sobre la community raíz del repositorio.
 * Si el recurso no es la raíz, la regla no aplica y se considera satisfecha.
 */
export class SuperAdminOnlyForTopLevelSpec implements ScopeSpecification {
  isSatisfiedBy(context: ScopeContext): boolean {
    if (context.dsoType !== 'community-toplevel') {
      return true;
    }
    return isSuperadmin(context.caller);
  }

  rejectionMessage(context: ScopeContext): string {
    return `Solo SuperAdmin puede operar sobre la community top-level. Caller actual: rol=${context.caller.role}, scope=${context.caller.scopeUuid ?? 'ninguno'}.`;
  }
}
