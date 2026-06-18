import { MetadataMap } from './metadata.model';
import { Bitstream } from './bitstream.model';
import { Collection } from './collection.model';

export interface Item {
  uuid: string;
  name: string;
  handle: string;
  metadata: MetadataMap;
  inArchive: boolean;
  discoverable: boolean;
  withdrawn: boolean;
  lastModified: string;
  type: string;
  /**
   * Bitstream del thumbnail asociado al item, presente solo cuando el endpoint
   * que devuelve el item lo trae embebido vía `?embed=thumbnail` en discover.
   * Permite armar la URL del thumbnail sin pegar al endpoint nativo
   * /items/{uuid}/thumbnail (que en DSpace 9 devuelve 204 si la portada
   * manual no está asociada al primary bitstream del ORIGINAL).
   */
  thumbnail?: Bitstream;
  /**
   * Colección dueña del item, presente solo cuando el search se pide con
   * `embed=owningCollection`. La búsqueda avanzada la usa para armar la URL
   * canónica del detalle sin una petición por item.
   */
  owningCollection?: Collection;
}
