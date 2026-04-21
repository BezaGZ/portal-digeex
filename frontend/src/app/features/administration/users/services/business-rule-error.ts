/**
 * Códigos tipados de las reglas de negocio del panel de administración
 * de usuarios. Se listan acá para que el consumidor (componentes, toasts,
 * i18n) pueda hacer un switch exhaustivo sobre el motivo del error sin
 * depender del texto del mensaje, que puede cambiar o traducirse.
 *
 * Mapeo a reglas de negocio:
 *  - DUPLICATE_EMAIL     → RN-10 (una cuenta por correo)
 *  - EMAIL_INVALID       → RN-02 (correo institucional obligatorio)
 *  - SUPERADMIN_LIMIT    → RN-11 (máximo 2 superadmins activos)
 *  - LAST_SUPERADMIN     → RN-11 (proteger al último superadmin)
 *  - SELF_DEACTIVATE     → RN-12 (no autodesactivación)
 *  - SUBDIVISION_REQUIRED → RN-08 (alcance del admin de subdirección)
 *  - NOT_FOUND           → usuario no existe en el signal/lista
 */
export type BusinessRuleErrorCode =
  | 'DUPLICATE_EMAIL'
  | 'EMAIL_INVALID'
  | 'SUPERADMIN_LIMIT'
  | 'LAST_SUPERADMIN'
  | 'SELF_DEACTIVATE'
  | 'SUBDIVISION_REQUIRED'
  | 'NOT_FOUND';

/**
 * Ciclo 9 — Sprint 5.
 *
 * Stub intencionalmente vacío: el constructor recibe los argumentos pero
 * no los preserva, y la clase no extiende Error. Esto hace que los tests
 * del spec fallen en runtime (code undefined, message undefined, no es
 * instancia de Error, name incorrecto), que es la señal RED esperada.
 *
 * La implementación real se completa en la fase GREEN.
 */
export class BusinessRuleError {
  readonly code!: BusinessRuleErrorCode;
  readonly message!: string;
  readonly name!: string;

  constructor(_code: BusinessRuleErrorCode, _message: string) {

  }
}
