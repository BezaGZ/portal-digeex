import { MetadataMap } from './metadata.model';
import { Group } from './group.model';

/**
 * Subrecursos que DSpace puede anidar en una Collection con ?embed=.
 * Por ahora solo se modela submittersGroup, que es el grupo al que se
 * agrega al personal_delegado al crear el eperson (Ciclo 11).
 */
export interface CollectionEmbedded {
  submittersGroup?: Group | null;
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
