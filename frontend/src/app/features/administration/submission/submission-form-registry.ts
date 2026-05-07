import { Type } from '@angular/core';

/**
 * Mapa entity-type → componente del formulario de submission. Cualquier
 * componente registrado debe aceptar `collection` y `caller` como inputs;
 * el host se los pasa vía NgComponentOutlet.
 */
export type SubmissionFormType = Type<unknown>;

const REGISTRY: Record<string, SubmissionFormType> = {};

/** Devuelve null si el tipo no está registrado o si entityType es undefined. */
export function getSubmissionFormComponent(
  entityType: string | undefined,
): SubmissionFormType | null {
  if (!entityType) return null;
  return REGISTRY[entityType] ?? null;
}

/** Idempotente: re-registrar el mismo entity-type sobreescribe la entrada. */
export function registerSubmissionForm(
  entityType: string,
  component: SubmissionFormType,
): void {
  REGISTRY[entityType] = component;
}

/** Solo para tests; producción no consume esta función. */
export function clearSubmissionFormRegistry(): void {
  for (const key of Object.keys(REGISTRY)) {
    delete REGISTRY[key];
  }
}
