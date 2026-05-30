import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Verifica si el email termina con alguno de los dominios permitidos.
 * Util pura sin acoplamiento a Angular para que pueda usarse desde
 * servicios y guards además de validators de Reactive Forms.
 */
export function isAllowedEmailDomain(email: string, domains: readonly string[]): boolean {
  const normalized = email.toLowerCase();
  return domains.some((domain) => normalized.endsWith(domain.toLowerCase()));
}

/**
 * Factory de `ValidatorFn` que rechaza emails fuera de la lista de
 * dominios permitidos. Emite `emailDomain` con `allowedDomains` para que
 * el template renderice un mensaje específico con los dominios aceptados.
 */
export function allowedEmailDomainsValidator(domains: readonly string[]): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (!value) {
      return null;
    }
    return isAllowedEmailDomain(value, domains)
      ? null
      : { emailDomain: { allowedDomains: domains } };
  };
}
