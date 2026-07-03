import { PASSWORD_MIN_LENGTH, passwordRuleViolations } from './password-rules';

/**
 * Tests de `passwordRuleViolations`.
 *
 * Fuente única de RN-03 (mínimo 8 caracteres, una mayúscula, un número).
 * La consumen el `passwordRulesValidator` del form reactivo (recuperar
 * contraseña) y el chequeo imperativo del perfil, así ambos comparten la
 * regla sin duplicar los patrones.
 *
 * Ciclo 57 TDD — Sprint 10.
 */
describe('passwordRuleViolations', () => {
  /** Verifica que un valor vacío no reporte violaciones; el vacío lo gobierna quien exija el campo. */
  it('should return an empty list for an empty value', () => {
    expect(passwordRuleViolations('')).toEqual([]);
  });

  /** Verifica que un valor más corto que el mínimo reporte minLength. */
  it('should report minLength when the value is shorter than the minimum', () => {
    expect(passwordRuleViolations('Ab12345')).toEqual(['minLength']);
  });

  /** Verifica que un valor sin mayúscula reporte uppercase. */
  it('should report uppercase when the value has no uppercase letter', () => {
    expect(passwordRuleViolations('contrase1na')).toEqual(['uppercase']);
  });

  /** Verifica que un valor sin dígito reporte number. */
  it('should report number when the value has no digit', () => {
    expect(passwordRuleViolations('Contraseña')).toEqual(['number']);
  });

  /** Verifica que un valor que rompe las tres reglas las reporte juntas, en orden estable. */
  it('should report all three violations for a value that breaks every rule', () => {
    expect(passwordRuleViolations('abc')).toEqual(['minLength', 'uppercase', 'number']);
  });

  /** Verifica que un valor que cumple RN-03 no reporte violaciones. */
  it('should return an empty list for a value that satisfies RN-03', () => {
    expect(passwordRuleViolations('Segura123')).toEqual([]);
  });

  /** Verifica que el mínimo se exponga como constante para que los consumidores no lo hardcodeen. */
  it('should expose the minimum length as a constant', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
