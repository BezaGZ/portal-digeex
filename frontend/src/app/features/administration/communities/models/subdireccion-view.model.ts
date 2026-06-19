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
   * los de todas sus colecciones). Se lee del campo nativo
   * `archivedItemsCount` del recurso Community, que devuelve el conteo real
   * con `webui.strengths.show = true` (habilitado en Sprint 8).
   */
  recursosCount?: number;
}
