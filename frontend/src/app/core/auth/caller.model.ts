import { UserRole } from './user-role.model';

/**
 * Identidad mínima del usuario que pide ejecutar la operación. `role` es el
 * rol del portal y `sufijo` es el identificador de la subdirección a la que
 * pertenece (ej. ED_BASICA); null para SuperAdmin, que opera sin scope acotado.
 */
export interface Caller {
  role: UserRole;
  sufijo: string | null;
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
