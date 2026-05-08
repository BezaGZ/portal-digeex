import { MetadataValue } from '../../../core/api/models/metadata.model';

/** Envuelve un string en el shape MetadataValue que DSpace espera al patchear el workspaceitem. */
export function mv(value: string): MetadataValue {
  return { value, language: null, authority: null, confidence: -1, place: 0 };
}
