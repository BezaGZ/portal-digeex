export const environment = {
  production: true,
  apiUrl: '',
  /**
   * En producción solo se acepta el dominio institucional. Cualquier
   * cuenta fuera de @mineduc.gob.gt queda rechazada por el validador
   * antes de llegar al backend.
   */
  allowedEmailDomains: ['@mineduc.gob.gt']
};
