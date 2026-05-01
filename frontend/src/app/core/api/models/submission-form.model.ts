/**
 * Modelo del formulario de submission de DSpace, aplanado para el frontend.
 *
 * El JSON original que devuelve `/api/config/submissionforms/{name}` envuelve
 * los campos en `rows[].fields[]` (agrupación visual del XML). Para el portal
 * DIGEEX cada `<row>` tiene un solo `<field>`, así que el wrapper aplana a
 * `fields: SubmissionFormField[]` y descarta la propiedad `rows` que no
 * aporta información adicional. Si en el futuro hace falta soporte para
 * filas multi-columna, se agrega `rowIndex` al field.
 */
export interface SubmissionForm {
  id: string;
  name: string;
  fields: SubmissionFormField[];
}

/**
 * Campo individual del formulario, ya aplanado.
 *
 * `metadata` viene del primer entry de `selectableMetadata[]` del JSON
 * original (el portal solo usa un selectableMetadata por field).
 * `vocabularyName` viene de `selectableMetadata[].controlledVocabulary` y
 * apunta al endpoint `/api/submission/vocabularies/{vocabularyName}/entries`
 * para obtener los valores del dropdown. Cuando el campo es texto libre,
 * `vocabularyName` queda undefined.
 */
export interface SubmissionFormField {
  metadata: string;
  label: string;
  inputType: string;
  mandatory: boolean;
  repeatable: boolean;
  hints?: string;
  mandatoryMessage?: string;
  vocabularyName?: string;
}
