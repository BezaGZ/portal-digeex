/**
 * Roles del portal. Vive en `core/auth` (no en la feature de usuarios) para que
 * los guards y el servicio de autorización del core no importen de una pantalla.
 */
export type UserRole =
  | 'superadmin'
  | 'admin_subdireccion'
  | 'personal_delegado';
