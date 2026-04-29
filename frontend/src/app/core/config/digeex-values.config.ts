/**
 * Valores centralizados de entity-types DIGEEX.
 *
 * dspace.entity.type es un campo nativo de DSpace que se asigna a la colección
 * y se hereda automáticamente a cada item creado dentro. Sirve para enrutar
 * vistas públicas, elegir el formulario de submission y filtrar items en la
 * búsqueda Discovery, todo desde una sola fuente de verdad alineada al
 * patrón canónico del ecosistema.
 *
 * Si DIGEEX cambia un valor en backend/dspace/config/entities/digeex-entity-types.xml,
 * solo se modifica aquí y todo el frontend se actualiza automáticamente.
 */

/** Valores válidos para dspace.entity.type (Collection e Item) */
export const ENTITY_TYPE = {
  DOCUMENTO: 'Documento',
  GALERIA: 'Galeria',
  ESTADISTICA: 'Estadistica',
} as const;

/** Valores válidos para digeex.navLocation (nivel Collection) */
export const NAV_LOCATION = {
  MENU_PRINCIPAL: 'menu-principal',
  MENU_SECUNDARIO: 'menu-secundario',
} as const;
