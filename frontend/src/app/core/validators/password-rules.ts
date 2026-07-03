/**
 * RN-03: una contraseña válida tiene al menos 8 caracteres, una letra
 * mayúscula y un número. Fuente única de la regla; el validador reactivo y
 * los chequeos imperativos derivan de aquí en lugar de repetir los patrones.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleViolation = 'minLength' | 'uppercase' | 'number';

/**
 * Devuelve las reglas de RN-03 que incumple `value`, en orden estable
 * (longitud, mayúscula, número). Lista vacía si cumple o si viene vacío: el
 * caso vacío lo gobierna quien exija el campo (`Validators.required` o el
 * chequeo de "campo obligatorio"), no esta regla de complejidad.
 */
export function passwordRuleViolations(value: string): PasswordRuleViolation[] {
  if (!value) {
    return [];
  }
  const violations: PasswordRuleViolation[] = [];
  if (value.length < PASSWORD_MIN_LENGTH) {
    violations.push('minLength');
  }
  if (!/[A-Z]/.test(value)) {
    violations.push('uppercase');
  }
  if (!/[0-9]/.test(value)) {
    violations.push('number');
  }
  return violations;
}
