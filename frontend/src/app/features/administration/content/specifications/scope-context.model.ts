import { UserRole } from '../../users/models/user-view.model';

/**
 * Tipo de DSO sobre el que se valida un scope. La distinción entre la
 * community raíz y las subcomunidades de subdirecciones permite aplicar
 * RN-40 (solo SuperAdmin sobre la raíz) sin ambigüedad.
 */
export type DsoType =
  | 'community-toplevel'
  | 'community-sub'
  | 'collection'
  | 'item';

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
 * Datos que describen una operación pendiente de validar: qué tipo de recurso
 * se va a tocar, a qué subdirección pertenece (null si es la raíz) y quién
 * la pide.
 */
export interface ScopeContext {
  dsoType: DsoType;
  resourceSufijo: string | null;
  caller: Caller;
}

/**
 * Cada regla de scope se modela como una especificación independiente.
 * `isSatisfiedBy` devuelve true cuando la regla acepta la operación;
 * `rejectionMessage` produce el texto que el caller verá en el error
 * cuando no la acepta.
 */
export interface ScopeSpecification {
  isSatisfiedBy(context: ScopeContext): boolean;
  rejectionMessage(context: ScopeContext): string;
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
