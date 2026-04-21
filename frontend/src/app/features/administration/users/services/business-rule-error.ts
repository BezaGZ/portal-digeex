/**
 * Códigos tipados de las reglas de negocio del panel de administración
 * de usuarios. Se listan acá para que el consumidor (componentes, toasts,
 * i18n) pueda hacer un switch exhaustivo sobre el motivo del error sin
 * depender del texto del mensaje, que puede cambiar o traducirse.
 *
 * Mapeo a reglas de negocio:
 *  - DUPLICATE_EMAIL         → RN-10 (una cuenta por correo)
 *  - EMAIL_INVALID           → RN-02 (correo institucional obligatorio)
 *  - LAST_SUPERADMIN         → RN-11 (proteger al último superadmin activo)
 *  - SELF_DEACTIVATE         → RN-12 (no autodesactivación)
 *  - SUBDIVISION_REQUIRED    → RN-26 (subdirección obligatoria si el rol no es superadmin)
 *  - INSUFFICIENT_PRIVILEGES → RN-08 y RN-13 (el caller intenta actuar fuera de su ámbito o elevar permisos por encima de su propio rol)
 *  - NOT_FOUND               → recurso no existe
 */
export type BusinessRuleErrorCode =
  | 'DUPLICATE_EMAIL'
  | 'EMAIL_INVALID'
  | 'LAST_SUPERADMIN'
  | 'SELF_DEACTIVATE'
  | 'SUBDIVISION_REQUIRED'
  | 'INSUFFICIENT_PRIVILEGES'
  | 'NOT_FOUND';

/**
 * Error de regla de negocio del panel de usuarios. Extiende Error para
 * que los operadores de RxJS (catchError) y los handlers globales lo
 * traten como un error nativo, y agrega un `code` tipado para que el
 * consumidor pueda decidir el mensaje a mostrar sin parsear strings.
 *
 * Ciclo 9  — Sprint 5.
 */
export class BusinessRuleError extends Error {
  /**
   * Código estable de la regla violada. Se mantiene como `readonly`
   * porque una vez emitido el error no debe cambiar de identidad.
   */
  readonly code: BusinessRuleErrorCode;

  constructor(code: BusinessRuleErrorCode, message: string) {
    super(message);
    this.code = code;
    /**
     * Forzar el name del prototipo. Por defecto Error.name queda como
     * 'Error', y queremos que `err.name` y los logs muestren el tipo
     * real para distinguir errores de dominio de los HTTP genéricos.
     */
    this.name = 'BusinessRuleError';
    /**
     * Restaurar la cadena de prototipos. Es el patrón recomendado para
     * subclases de Error en TypeScript: sin esta línea, dependiendo del
     * target de compilación, `instanceof BusinessRuleError` puede
     * devolver false porque el constructor de Error rompe la cadena.
     * Ver https://github.com/microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
     */
    Object.setPrototypeOf(this, BusinessRuleError.prototype);
  }
}
