import { MetadataMap } from './metadata.model';
import { Group } from './group.model';

/**
 * Subrecursos que DSpace puede anidar en un Community cuando se pide
 * con ?embed=. Por ahora solo se modela adminGroup, que es el que necesita
 * el facade de usuarios para resolver el grupo destino al crear un
 * admin_subdireccion (Ciclo 11).
 */
export interface CommunityEmbedded {
  adminGroup?: Group | null;
}

export interface Community {
  uuid: string;
  name: string;
  handle: string;
  metadata: MetadataMap;
  archivedItemsCount: number;
  type: string;
  _embedded?: CommunityEmbedded;
}

/**
 * Body que DSpace 9.x exige al crear una community vía POST. El campo
 * `type` es el discriminador del recurso; DSpace lo valida contra el path
 * y rechaza el POST si no coincide.
 */
export interface CommunityCreateBody {
  name: string;
  metadata: MetadataMap;
  type: 'community';
}
