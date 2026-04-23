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
 *  - SELF_DEACTIVATE         → RN-12 y RN-27 (no autodesactivarse ni autocambiarse de rol)
 *  - SELF_RESET              → RN-31 (no autoreset de contraseña desde el panel)
 *  - SUBDIVISION_REQUIRED    → RN-26 (subdirección obligatoria si el rol no es superadmin)
 *  - INSUFFICIENT_PRIVILEGES → RN-08 y RN-13 (actuar fuera del ámbito o elevar permisos por encima del propio rol)
 *  - OUT_OF_SCOPE            → RN-32 (admin_subdireccion sobre un eperson de otra subdirección)
 *  - NOT_FOUND               → recurso no existe
 */
export type BusinessRuleErrorCode =
  | 'DUPLICATE_EMAIL'
  | 'EMAIL_INVALID'
  | 'LAST_SUPERADMIN'
  | 'SELF_DEACTIVATE'
  | 'SELF_RESET'
  | 'SUBDIVISION_REQUIRED'
  | 'INSUFFICIENT_PRIVILEGES'
  | 'OUT_OF_SCOPE'
  | 'NOT_FOUND';

/**
 * Error de regla de negocio del panel de usuarios. Extiende Error para que
 * catchError y los handlers globales lo traten como error nativo, y expone
 * un `code` tipado para que el consumidor mapee a toast sin parsear texto.
 */
export class BusinessRuleError extends Error {
  /** Código estable de la regla violada; una vez emitido no cambia de identidad. */
  readonly code: BusinessRuleErrorCode;

  constructor(code: BusinessRuleErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'BusinessRuleError';
    Object.setPrototypeOf(this, BusinessRuleError.prototype);
  }
}
