import { BusinessRuleError } from './business-rule-error';

/**
 * Smoke test del re-export shim. La implementación real y sus tests viven
 * en `core/error/business-rule-error`. Este test solo confirma que el
 * shim sigue exportando la clase desde el path legacy mientras se completa
 * la migración de imports.
 */
describe('BusinessRuleError (legacy import path)', () => {
  it('should still be importable from the legacy users/services/ path', () => {
    const err = new BusinessRuleError('OUT_OF_SCOPE', 'test message');
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect(err.code).toBe('OUT_OF_SCOPE');
  });
});
