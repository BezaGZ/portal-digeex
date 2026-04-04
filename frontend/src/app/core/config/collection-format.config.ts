/**
 * Configuración centralizada de rutas según dc.format de colecciones DSpace.
 *
 * Cuando DIGEEX necesite agregar un nuevo tipo de renderizado:
 * 1. Agregar dc.format al Collection en DSpace (ej: "mapa")
 * 2. Crear la ruta en app.routes.ts (ej: path: 'mapas')
 * 3. Agregar UNA línea aquí: mapa: '/mapas'
 *
 * No se necesita tocar Home, PublicHeader ni ProgramView.
 */

/** Rutas especiales por formato. Si dc.format no está aquí, usa /programas/:uuid */
const FORMAT_ROUTES: Record<string, string> = {
  galeria: '/galeria',
  estadistica: '/estadistica',
};

/**
 * Devuelve la ruta frontend correcta para una colección según su dc.format.
 *
 * @param format - Valor de dc.format de la colección ('documento' | 'galeria' | 'estadistica' | ...)
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
