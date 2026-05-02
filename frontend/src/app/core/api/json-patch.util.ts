/**
 * Utilidades para construir operaciones JSON Patch (RFC 6902) que DSpace 9.x
 * acepta en endpoints PATCH como `/api/eperson/epersons/{uuid}` o
 * `/api/core/collections/{uuid}`.
 *
 * Tipos discriminados por la propiedad `op` para que cada operación quede
 * bien tipada en su forma específica. Los wrappers HTTP componen arreglos
 * de `JsonPatchEntry` y los envían como body del PATCH.
 */

export const PATCH_OP_REPLACE = 'replace';
export const PATCH_OP_ADD = 'add';
export const PATCH_OP_REMOVE = 'remove';

/** Replace: el patrón habitual para editar un campo plano del recurso. */
export interface JsonPatchReplace {
  op: typeof PATCH_OP_REPLACE;
  path: string;
  value: string | boolean;
}

/**
 * Add: para casos donde el value es un objeto (por ejemplo el cambio de
 * contraseña con `current_password` y `new_password` en lugar de un escalar).
 */
export interface JsonPatchAdd {
  op: typeof PATCH_OP_ADD;
  path: string;
  value: object;
}

/** Remove: borra el path indicado del recurso. */
export interface JsonPatchRemove {
  op: typeof PATCH_OP_REMOVE;
  path: string;
}

/** Cualquier entrada que acepta el body PATCH de DSpace. */
export type JsonPatchEntry = JsonPatchReplace | JsonPatchAdd | JsonPatchRemove;

/**
 * Construye una operación replace de JSON Patch. Helper stateless para
 * evitar repetir la estructura `{ op: 'replace', path, value }`.
 */
export function replaceOp(path: string, value: string | boolean): JsonPatchReplace {
  return { op: PATCH_OP_REPLACE, path, value };
}

/** Construye una operación add con value de tipo objeto. */
export function addOp(path: string, value: object): JsonPatchAdd {
  return { op: PATCH_OP_ADD, path, value };
}

/** Construye una operación remove sobre el path dado. */
export function removeOp(path: string): JsonPatchRemove {
  return { op: PATCH_OP_REMOVE, path };
}
