import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Aplica RN-03: mínimo 8 caracteres, al menos una mayúscula y un número.
 * Emite `null` con valor vacío para no chocar con `Validators.required`.
 * Los keys (`passwordMinLength`, `passwordUppercase`, `passwordNumber`)
 * dan feedback específico antes del 422 que devolvería DSpace server-side.
 */
export function passwordRulesValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString();
    if (!value) {
      return null;
    }
    const errors: ValidationErrors = {};
    if (value.length < 8) {
      errors['passwordMinLength'] = { required: 8 };
    }
    if (!/[A-Z]/.test(value)) {
      errors['passwordUppercase'] = true;
    }
    if (!/[0-9]/.test(value)) {
      errors['passwordNumber'] = true;
    }
    return Object.keys(errors).length > 0 ? errors : null;
  };
}
