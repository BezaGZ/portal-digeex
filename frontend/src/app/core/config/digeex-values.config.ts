/**
 * Valores centralizados del schema custom "digeex" usado en DSpace.
 *
 * Si un valor cambia en DSpace (ej: 'documento' → 'recurso'), solo se
 * modifica aquí y todo el frontend se actualiza automáticamente.
 */

/** Valores válidos para digeex.contentType (nivel Item) */
export const CONTENT_TYPE = {
  DOCUMENTO: 'documento',
  GALERIA: 'galeria',
  ESTADISTICA: 'estadistica',
} as const;

/** Valores válidos para digeex.navLocation (nivel Collection) */
export const NAV_LOCATION = {
  MENU_PRINCIPAL: 'menu-principal',
  MENU_SECUNDARIO: 'menu-secundario',
} as const;

/** Valores válidos para digeex.renderType (nivel Collection) */
export const RENDER_TYPE = {
  DOCUMENTO: 'documento',
  GALERIA: 'galeria',
  ESTADISTICA: 'estadistica',
} as const;
