/**
 * Entry de un vocabulario controlado de DSpace.
 *
 * El JSON original que devuelve `/api/submission/vocabularies/{name}/entries`
 * incluye además `otherInformation` (objeto vacío en los vocabularios DIGEEX)
 * y `type: "vocabularyEntry"`. El wrapper descarta esos campos porque el
 * frontend solo necesita el par display/value para alimentar dropdowns.
 *
 * `value` es el texto que se persiste como metadata del item; `display` es
 * lo que ve el usuario en el dropdown.
 */
export interface VocabularyEntry {
  display: string;
  value: string;
}
