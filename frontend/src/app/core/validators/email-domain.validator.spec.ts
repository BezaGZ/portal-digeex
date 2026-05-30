import { FormControl } from '@angular/forms';
import {
  allowedEmailDomainsValidator,
  isAllowedEmailDomain,
} from './email-domain.validator';

/**
 * Tests de `email-domain.validator`.
 *
 * Cubre la util pura `isAllowedEmailDomain` (case-insensitive sobre el
 * sufijo del email) y el factory `allowedEmailDomainsValidator` que la
 * envuelve en un `ValidatorFn` con el shape de error `emailDomain`.
 *
 * Ciclo 2 TDD — Sprint 8.
 */
describe('email-domain.validator', () => {
  const DOMAINS = ['@mineduc.gob.gt', '@ingenieria.usac.edu.gt'] as const;

  describe('isAllowedEmailDomain()', () => {
    /** Verifica que un email cuyo dominio termina con uno de la lista pase. */
    it('should return true when the email ends with an allowed domain', () => {
      expect(isAllowedEmailDomain('persona@mineduc.gob.gt', DOMAINS)).toBe(true);
    });

    /** Verifica que un email fuera de la lista sea rechazado. */
    it('should return false when the email does not match any allowed domain', () => {
      expect(isAllowedEmailDomain('persona@gmail.com', DOMAINS)).toBe(false);
    });

    /** Verifica que el chequeo sea case-insensitive para no fallar por mayúsculas. */
    it('should match case-insensitively to tolerate uppercase input', () => {
      expect(isAllowedEmailDomain('PERSONA@MINEDUC.GOB.GT', DOMAINS)).toBe(true);
    });
  });

  describe('allowedEmailDomainsValidator()', () => {
    const validate = (value: string) =>
      allowedEmailDomainsValidator(DOMAINS)(new FormControl(value));

    /** Verifica que el control vacío emita null para no chocar con required. */
    it('should return null for empty value to let Validators.required own the rule', () => {
      expect(validate('')).toBeNull();
    });

    /** Verifica que un dominio permitido pase sin errores. */
    it('should return null when the email matches an allowed domain', () => {
      expect(validate('persona@mineduc.gob.gt')).toBeNull();
    });

    /**
     * Verifica que un dominio fuera de la lista emita `emailDomain` con
     * los `allowedDomains` para que el template renderice el mensaje.
     */
    it('should emit emailDomain with allowedDomains when the email is not in the list', () => {
      const errors = validate('persona@gmail.com');
      expect(errors).not.toBeNull();
      expect(errors!['emailDomain'].allowedDomains).toEqual(DOMAINS);
    });
  });
});
