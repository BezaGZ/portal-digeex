import { EPerson } from '../../api/models';

/**
 * Credenciales para el endpoint POST /api/authn/login.
 *
 * DSpace espera el body en formato x-www-form-urlencoded
 * con los campos `user` (correo) y `password`.
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Respuesta del endpoint GET /api/authn/status.
 *
 * DSpace siempre responde 200. La diferencia está en el campo
 * `authenticated`: true si hay sesión activa, false si no.
 * Cuando está autenticado, incluye el EPerson en `_embedded`.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/authentication.md
 */
export interface AuthStatus {
  okay: boolean;
  authenticated: boolean;
  _embedded?: {
    eperson: EPerson;
  };
  _links?: {
    eperson?: {
      href: string;
    };
  };
}

/**
 * Datos del usuario autenticado para uso en el frontend.
 *
 * Se construye a partir del EPerson que devuelve /api/authn/status.
 * Solo los campos que necesitamos en Angular — el EPerson completo
 * tiene más campos pero no los usamos en la UI.
 */
export interface AuthUser {
  uuid: string;
  email: string;
  firstName: string;
  lastName: string;
  requiresPasswordChange: boolean;
}
