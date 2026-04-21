import { BusinessRuleError } from './business-rule-error';

/**
 * Tests de BusinessRuleError, clase de error de dominio del panel de
 * usuarios. Reemplaza el patrón `{ success: false, error: 'texto' }` 
 *
 * La separación entre `code` (identificador estable) y `message` (texto
 * para mostrar) permite que el componente decida cómo presentar el error
 * sin parsear cadenas, y deja abierta la puerta a i18n sin tocar el
 * servicio.
 *
 * Ciclo 9 — Sprint 5.
 */
describe('BusinessRuleError', () => {
  /**
   * Verifica que el código del error queda accesible como propiedad
   * para que el consumidor pueda ramificar con un switch exhaustivo.
   */
  it('should expose the code passed in the constructor', () => {
    const err = new BusinessRuleError('DUPLICATE_EMAIL', 'Correo ya registrado');
    expect(err.code).toBe('DUPLICATE_EMAIL');
  });

  /**
   * Verifica que el mensaje humano se preserva para poder mostrarlo
   * en un toast o modal sin tener que construirlo desde el code.
   */
  it('should expose the message passed in the constructor', () => {
    const err = new BusinessRuleError('SUPERADMIN_LIMIT', 'Ya existen 2 superadmins activos');
    expect(err.message).toBe('Ya existen 2 superadmins activos');
  });

  /**
   * Verifica que hereda de Error para que los operadores de RxJS
   * (catchError, retryWhen) y los handlers globales lo traten como
   * un error nativo y preserven el stack trace.
   */
  it('should be an instance of Error so catchError treats it as one', () => {
    const err = new BusinessRuleError('NOT_FOUND', 'Usuario no encontrado');
    expect(err instanceof Error).toBe(true);
  });

  /**
   * Verifica que el name es "BusinessRuleError" para distinguirlo en
   * logs y en cualquier chequeo `err.name ===` que haga el consumidor.
   */
  it('should have name set to "BusinessRuleError" to distinguish it in logs', () => {
    const err = new BusinessRuleError('LAST_SUPERADMIN', 'Debe quedar al menos un superadmin');
    expect(err.name).toBe('BusinessRuleError');
  });
});
