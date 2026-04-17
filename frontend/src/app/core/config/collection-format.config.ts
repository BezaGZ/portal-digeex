/**
 * Configuración centralizada de rutas según digeex.renderType de colecciones DSpace.
 *
 * Cuando DIGEEX necesite agregar un nuevo tipo de renderizado:
 * 1. Agregar digeex.renderType al Collection en DSpace (ej: "mapa")
 * 2. Crear la ruta en app.routes.ts (ej: path: 'mapas')
 * 3. Agregar UNA línea aquí: mapa: '/mapas'
 *
 * No se necesita tocar Home, PublicHeader ni ProgramView.
 */

import { RENDER_TYPE } from './digeex-values.config';

/** Rutas especiales por formato. Si digeex.renderType no está aquí, usa /programas/:uuid */
const FORMAT_ROUTES: Record<string, string> = {
  [RENDER_TYPE.GALERIA]: '/galeria',
  [RENDER_TYPE.ESTADISTICA]: '/estadistica',
};

/**
 * Devuelve la ruta frontend correcta para una colección según su digeex.renderType.
 *
 * @param format - Valor de digeex.renderType de la colección ('documento' | 'galeria' | 'estadistica' | ...)
 * @param uuid - UUID de la colección (usado solo para tipo 'documento')
 * @returns Ruta absoluta para navegación con Router.navigate()
 *
 * @example
 * getCollectionRoute('documento', 'abc-123')  // '/programas/abc-123'
 * getCollectionRoute('galeria', 'def-456')    // '/galeria'
 * getCollectionRoute('estadistica', 'ghi-789') // '/estadistica'
 */
export function getCollectionRoute(format: string, uuid: string): string {
  return FORMAT_ROUTES[format] ?? `/programas/${uuid}`;
}
