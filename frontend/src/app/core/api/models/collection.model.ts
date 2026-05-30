import { MetadataMap } from './metadata.model';
import { Group } from './group.model';
import { Bitstream } from './bitstream.model';

/**
 * Subrecursos que DSpace puede anidar en una Collection con ?embed=.
 * Modela submittersGroup (delegado on-create) y logo (portada del programa
 * embebida en listados para evitar una llamada extra por collection).
 */
export interface CollectionEmbedded {
  submittersGroup?: Group | null;
  logo?: Bitstream | null;
}

export interface Collection {
  uuid: string;
  name: string;
  handle: string;
  metadata: MetadataMap;
  archivedItemsCount: number;
  type: string;
  _embedded?: CollectionEmbedded;
}

/**
 * Body que DSpace 9.x exige al crear una collection vía POST. El campo
 * `type` es el discriminador del recurso; DSpace lo valida contra el path
 * y rechaza el POST si no coincide.
 */
export interface CollectionCreateBody {
  name: string;
  metadata: MetadataMap;
  type: 'collection';
}
