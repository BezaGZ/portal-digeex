import { MetadataValue } from '../../../core/api/models/metadata.model';
import { JsonPatchEntry, addOp, removeOp, replaceOp } from '../../../core/api/json-patch.util';

/**
 * Compara los valores actuales del form con la metadata original del item y
 * arma el JSON Patch mínimo (RFC 6902) que DSpace 9 acepta en
 * `PATCH /api/core/items/{uuid}`: replace sobre paths existentes,
 * add para campos nuevos y remove para campos que se vaciaron.
 *
 * Los paths siguen el contrato oficial: `/metadata/<schema>.<element>.<qualifier>`
 * para add/remove y `/metadata/<...>/0/value` para replace del primer valor.
 */
export function buildMetadataPatch(
  newValues: Record<string, string | undefined>,
  originalMetadata: Record<string, MetadataValue[]>,
): JsonPatchEntry[] {
  const ops: JsonPatchEntry[] = [];
  for (const [field, raw] of Object.entries(newValues)) {
    const newValue = (raw ?? '').trim();
    const oldValues = originalMetadata[field] ?? [];
    const oldValue = oldValues[0]?.value ?? '';

    if (newValue === oldValue) continue;

    if (newValue && oldValues.length === 0) {
      ops.push(addOp(`/metadata/${field}`, [{ value: newValue }]));
    } else if (newValue && oldValues.length > 0) {
      ops.push(replaceOp(`/metadata/${field}/0/value`, newValue));
    } else if (!newValue && oldValues.length > 0) {
      ops.push(removeOp(`/metadata/${field}`));
    }
  }
  return ops;
}
