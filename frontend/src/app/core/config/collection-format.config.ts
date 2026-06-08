/**
 * Configuración centralizada de rutas según dspace.entity.type de colecciones DSpace.
 *
 * Cuando DIGEEX necesite agregar un nuevo tipo de renderizado:
 * 1. Registrar el entity-type en backend/dspace/config/entities/digeex-entity-types.xml
 * 2. Crear la ruta en app.routes.ts (ej: path: 'mapas/:uuid')
 * 3. Agregar UNA línea aquí: [ENTITY_TYPE.MAPA]: '/mapas'
 *
 * No se necesita tocar Home, PublicHeader ni ProgramView.
 */

import { ENTITY_TYPE } from './digeex-values.config';

/**
 * Prefijos de ruta por entity-type. La ruta final siempre incluye el UUID de
 * la colección (`<prefijo>/<uuid>`), lo cual permite tener varias colecciones
 * del mismo tipo renderizando en el mismo componente con scope distinto. Si
 * `dspace.entity.type` no está en el mapa, se usa `/programas` como fallback.
 */
const ENTITY_TYPE_ROUTE_PREFIX: Record<string, string> = {
  [ENTITY_TYPE.GALERIA]: '/galeria',
  [ENTITY_TYPE.ESTADISTICA]: '/estadistica',
};

/**
 * Devuelve la ruta frontend para una colección, siempre paramétrica por UUID.
 *
 * @param entityType - Valor de dspace.entity.type ('Documento' | 'Galeria' | 'Estadistica' | ...)
 * @param uuid - UUID de la colección
 * @returns Ruta absoluta para navegación con Router.navigate()
 *
 * @example
 * getCollectionRoute('Documento', 'abc-123')   // '/programas/abc-123'
 * getCollectionRoute('Galeria', 'def-456')     // '/galeria/def-456'
 * getCollectionRoute('Estadistica', 'ghi-789') // '/estadistica/ghi-789'
 */
export function getCollectionRoute(entityType: string, uuid: string): string {
  const prefix = ENTITY_TYPE_ROUTE_PREFIX[entityType] ?? '/programas';
  return `${prefix}/${uuid}`;
}
