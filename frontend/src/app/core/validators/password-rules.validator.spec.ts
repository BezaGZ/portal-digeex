import { FormControl } from '@angular/forms';
import { passwordRulesValidator } from './password-rules.validator';

/**
 * Tests de `passwordRulesValidator`.
 *
 * Aplica RN-03: mínimo 8 caracteres, al menos una letra mayúscula y al
 * menos un número. Cubre el caso vacío (delegado a `Validators.required`),
 * los tres tipos de violación por separado, y la combinación válida.
 *
 * Ciclo 1 TDD — Sprint 8.
 */
describe('passwordRulesValidator', () => {
  const validate = (value: string) =>
    passwordRulesValidator()(new FormControl(value));

  /** Sin valor el validador delega en `Validators.required` y emite `null`. */
  it('should return null for empty value to let Validators.required own the rule', () => {
    expect(validate('')).toBeNull();
  });

  /** Verifica que menos de 8 caracteres emita `passwordMinLength`. */
  it('should flag passwordMinLength when value has fewer than 8 characters', () => {
    const errors = validate('Ab12345');
    expect(errors).not.toBeNull();
    expect(errors!['passwordMinLength']).toEqual({ required: 8 });
  });

  /** Verifica que la ausencia de mayúscula emita `passwordUppercase`. */
  it('should flag passwordUppercase when value has no uppercase letter', () => {
    const errors = validate('contrase1na');
    expect(errors).not.toBeNull();
    expect(errors!['passwordUppercase']).toBe(true);
  });

  /** Verifica que la ausencia de dígito emita `passwordNumber`. */
  it('should flag passwordNumber when value has no digit', () => {
    const errors = validate('Contraseña');
    expect(errors).not.toBeNull();
    expect(errors!['passwordNumber']).toBe(true);
  });

  /** Verifica que una contraseña que cumple los tres criterios pase. */
  it('should return null for a value that satisfies all RN-03 rules', () => {
    expect(validate('Segura123')).toBeNull();
  });
});
