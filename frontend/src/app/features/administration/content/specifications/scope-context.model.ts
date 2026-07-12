import { Caller, Actor } from '../../../../core/auth/caller.model';

export type { Caller, Actor };

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
 * Datos que describen una operación pendiente de validar: qué tipo de recurso
 * se va a tocar, el uuid de la subdirección a la que pertenece (null si es
 * la raíz) y quién la pide. El scope del recurso y el del caller son uuids
 * afirmados por el backend; los nombres de grupo no participan.
 */
export interface ScopeContext {
  dsoType: DsoType;
  resourceScopeUuid: string | null;
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
