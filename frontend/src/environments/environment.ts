export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/server',
  /**
   * En desarrollo se incluye el dominio de testeo registrado en Resend
   * para validar end-to-end el flujo de reset de contraseña sin depender
   * del dominio institucional.
   */
  allowedEmailDomains: ['@mineduc.gob.gt', '@ingenieria.usac.edu.gt']
};
