import { MetadataValue } from './models/metadata.model';
import { JsonPatchEntry, addOp, removeOp, replaceOp } from './json-patch.util';

/**
 * Compara los valores nuevos con la metadata original del DSO y genera el
 * JSON Patch mínimo compatible con DSpace 9.2 para actualizar la metadata
 * de ítems, colecciones y comunidades.
 *
 * Reglas aplicadas según el REST Contract de DSpace 9.2:
 * 1. `add` se utiliza únicamente para campos ausentes (inicialización).
 * 2. `replace` sobre `/0/value` se utiliza para actualizar campos existentes.
 *    No se usa `add` sobre campos con valores previos porque el backend
 *    (`DSpaceObjectMetadataAddOperation`) realiza un "append" (anexado) si el
 *    índice es 0 o no se especifica, lo que provocaría duplicados.
 * 3. `remove` sobre la ruta completa del campo si el nuevo valor está vacío.
 * 4. Si el campo contiene valores duplicados históricamente, se eliminan
 *    las posiciones adicionales (de la última a la primera, descendente)
 *    mediante `remove` en índices individuales para evitar la desalineación de índices.
 */
export function buildMetadataPatch(
  newValues: Record<string, string | number | undefined>,
  originalMetadata: Record<string, MetadataValue[]>,
): JsonPatchEntry[] {
  const ops: JsonPatchEntry[] = [];
  for (const [field, raw] of Object.entries(newValues)) {
    // String(): los inputs numéricos de los forms entregan number y la
    // metadata de DSpace siempre persiste strings.
    const newValue = String(raw ?? '').trim();
    const oldValues = originalMetadata[field] ?? [];
    const oldValue = oldValues[0]?.value ?? '';

    if (!newValue) {
      if (oldValues.length > 0) ops.push(removeOp(`/metadata/${field}`));
      continue;
    }

    for (let i = oldValues.length - 1; i >= 1; i--) {
      ops.push(removeOp(`/metadata/${field}/${i}`));
    }

    if (oldValues.length === 0) {
      ops.push(addOp(`/metadata/${field}`, [{ value: newValue }]));
    } else if (newValue !== oldValue) {
      ops.push(replaceOp(`/metadata/${field}/0/value`, newValue));
    }
  }
  return ops;
}

/**
 * Diff por índice para un campo repetible (dc.subject y similares). DSpace 9.2
 * acepta con 200 pero no persiste un `remove` del campo entero seguido de un
 * `add` con array en la misma request, así que el diff va posición por posición.
 * Un campo ausente se inicializa con `add` de array: el índice `/-` exige que el
 * array ya exista.
 */
export function buildRepeatableMetadataPatch(
  field: string,
  newValues: string[],
  originalMetadata: Record<string, MetadataValue[]>,
): JsonPatchEntry[] {
  const ops: JsonPatchEntry[] = [];
  const oldValues = (originalMetadata[field] ?? []).map((mv) => mv.value);

  if (newValues.length === 0) {
    if (oldValues.length > 0) ops.push(removeOp(`/metadata/${field}`));
    return ops;
  }

  if (oldValues.length === 0) {
    ops.push(addOp(`/metadata/${field}`, newValues.map((value) => ({ value }))));
    return ops;
  }

  const shared = Math.min(oldValues.length, newValues.length);
  for (let i = 0; i < shared; i++) {
    if (oldValues[i] !== newValues[i]) {
      ops.push(replaceOp(`/metadata/${field}/${i}/value`, newValues[i]));
    }
  }
  for (let i = oldValues.length; i < newValues.length; i++) {
    ops.push(addOp(`/metadata/${field}/-`, { value: newValues[i] }));
  }
  for (let i = oldValues.length - 1; i >= newValues.length; i--) {
    ops.push(removeOp(`/metadata/${field}/${i}`));
  }
  return ops;
}
