import { Collection } from './models/collection.model';
import { BITSTREAMS_PATH, DSPACE_API_BASE } from './dspace-rest.util';

/**
 * Devuelve la URL relativa del bitstream del logo de la collection cuando viene embebido,
 * o null cuando no hay logo o no se pidió `?embed=logo`. Usa `DSPACE_API_BASE` para que
 * el consumidor (home, collection-table) no quede acoplado al shape HAL del response.
 */
export function extractLogoUrl(collection: Collection): string | null {
  const uuid = collection._embedded?.logo?.uuid;
  return uuid ? `${DSPACE_API_BASE}${BITSTREAMS_PATH}/${uuid}/content` : null;
}
