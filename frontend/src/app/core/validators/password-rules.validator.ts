import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { PASSWORD_MIN_LENGTH, passwordRuleViolations } from './password-rules';

/**
 * Adapta RN-03 (`passwordRuleViolations`) al contrato de validador reactivo.
 * Emite `null` con valor vacío para no chocar con `Validators.required`. Los
 * keys (`passwordMinLength`, `passwordUppercase`, `passwordNumber`) dan
 * feedback específico en el template antes del 422 que devolvería DSpace.
 */
export function passwordRulesValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const violations = passwordRuleViolations((control.value ?? '').toString());
    if (violations.length === 0) {
      return null;
    }
    const errors: ValidationErrors = {};
    if (violations.includes('minLength')) {
      errors['passwordMinLength'] = { required: PASSWORD_MIN_LENGTH };
    }
    if (violations.includes('uppercase')) {
      errors['passwordUppercase'] = true;
    }
    if (violations.includes('number')) {
      errors['passwordNumber'] = true;
    }
    return errors;
  };
}
