import { Injectable } from '@angular/core';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import {
  ScopeContext,
  ScopeSpecification,
} from '../specifications/scope-context.model';
import { SuperAdminOnlyForTopLevelSpec } from '../specifications/super-admin-only-for-top-level';
import { MatchingSufijoSpec } from '../specifications/matching-sufijo';

/**
 * Valida si una operación cae dentro del scope que el rol del usuario le
 * permite. Aplica las reglas de scope conocidas y, si alguna rechaza, lanza
 * BusinessRuleError con el código OUT_OF_SCOPE y el mensaje de la regla que
 * falló. No consulta el backend; trabaja sobre el contexto que recibe.
 */
@Injectable({ providedIn: 'root' })
export class ContentScopeService {
  private readonly specs: ReadonlyArray<ScopeSpecification> = [
    new SuperAdminOnlyForTopLevelSpec(),
    new MatchingSufijoSpec(),
  ];

  assertWithinScope(context: ScopeContext): void {
    const failing = this.specs.find((spec) => !spec.isSatisfiedBy(context));
    if (failing) {
      throw new BusinessRuleError('OUT_OF_SCOPE', failing.rejectionMessage(context));
    }
  }
}
