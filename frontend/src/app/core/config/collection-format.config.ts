/**
 * Configuración centralizada de rutas según dspace.entity.type de colecciones DSpace.
 *
 * Cuando DIGEEX necesite agregar un nuevo tipo de renderizado:
 * 1. Registrar el entity-type en backend/dspace/config/entities/digeex-entity-types.xml
 * 2. Crear la ruta en app.routes.ts (ej: path: 'mapas')
 * 3. Agregar UNA línea aquí: [ENTITY_TYPE.MAPA]: '/mapas'
 *
 * No se necesita tocar Home, PublicHeader ni ProgramView.
 */

import { ENTITY_TYPE } from './digeex-values.config';

/** Rutas especiales por entity-type. Si dspace.entity.type no está aquí, usa /programas/:uuid */
const ENTITY_TYPE_ROUTES: Record<string, string> = {
  [ENTITY_TYPE.GALERIA]: '/galeria',
  [ENTITY_TYPE.ESTADISTICA]: '/estadistica',
};

/**
 * Devuelve la ruta frontend correcta para una colección según su dspace.entity.type.
 *
 * @param entityType - Valor de dspace.entity.type ('Documento' | 'Galeria' | 'Estadistica' | ...)
 * @param uuid - UUID de la colección (usado solo para tipo 'Documento')
 * @returns Ruta absoluta para navegación con Router.navigate()
 *
 * @example
 * getCollectionRoute('Documento', 'abc-123')   // '/programas/abc-123'
 * getCollectionRoute('Galeria', 'def-456')     // '/galeria'
 * getCollectionRoute('Estadistica', 'ghi-789') // '/estadistica'
 */
export function getCollectionRoute(entityType: string, uuid: string): string {
  return ENTITY_TYPE_ROUTES[entityType] ?? `/programas/${uuid}`;
}
