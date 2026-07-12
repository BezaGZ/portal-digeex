import { UserRole } from './user-role.model';

/**
 * Identidad mínima del usuario que pide ejecutar la operación, afirmada por
 * el backend: `role` sale de las features de autorización y `scopeUuid` es
 * el uuid de su subdirección según los searches autorizados; null para
 * SuperAdmin (opera global) o cuando el backend no devuelve scope.
 */
export interface Caller {
  role: UserRole;
  scopeUuid: string | null;
}

/**
 * Identidad del usuario para la auditoría: nombre, apellido y correo. Se
 * mantiene separado de `Caller` porque `Caller` describe scope (qué puede
 * hacer) mientras que `Actor` describe identidad (quién lo hizo).
 */
export interface Actor {
  firstName: string;
  lastName: string;
  email: string;
}
