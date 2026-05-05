/**
 * Re-export shim. La implementación real vive en `core/error/business-rule-error`.
 * Este archivo se mantiene para no romper imports legacy mientras se migran
 * los consumidores.
 */
export {
  BusinessRuleError,
  type BusinessRuleErrorCode,
} from '../../../../core/error/business-rule-error';
