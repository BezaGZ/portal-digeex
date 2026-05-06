import { Community } from '../../../../core/api/models/community.model';

/**
 * Vista enriquecida de una subdirección para la pantalla de gestión.
 * Extiende `Community` con campos derivados que el container calcula
 * después del fetch (cantidad de programas resuelta vía
 * `CollectionApiService.listByCommunity`). Se mantiene como tipo
 * propio del feature para no contaminar el modelo del wrapper HTTP
 * con campos que no están en la respuesta de DSpace.
 */
export interface SubdireccionView extends Community {
  programasCount?: number;
  /**
   * Conteo de items archivados en la subdirección (recursivo, incluye
   * los de todas sus colecciones). Se computa pegando a Discovery con
   * scope filtrado, no se lee del campo `archivedItemsCount` del
   * recurso porque DSpace 9.x lo devuelve -1 incluso después de
   * reindexar (el cálculo en el path de Communities no se hace en la
   * respuesta REST).
   */
  recursosCount?: number;
}
