import { MetadataMap } from './metadata.model';
import { Group } from './group.model';

/**
 * Subrecursos que DSpace puede anidar en un Community cuando se pide
 * con ?embed=. Por ahora solo se modela adminGroup, que es el que necesita
 * el facade de usuarios para resolver el grupo destino al crear un
 * admin_subdireccion.
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
 * Sufijo de subdirección de una community, leído del metadato `digeex.sufijo`;
 * null cuando no está. Punto único de esa lectura: lo consumen las pantallas
 * del admin (`extractSufijo`) y la resolución de scope (`findCallerSub`).
 */
export function sufijoOf(community: Community): string | null {
  return community.metadata?.['digeex.sufijo']?.[0]?.value ?? null;
}

/**
 * Uuid del grupo ADMIN_<sufijo> de la subdirección, anotado en su metadata al
 * crearla. La relación grupo-subdirección solo existe por este registro, así
 * que los facades lo leen de acá para localizar el grupo sin depender del nombre.
 */
export function adminGroupUuidOf(community: Community): string | null {
  return community.metadata?.['digeex.adminGroup']?.[0]?.value ?? null;
}

/** Uuid del grupo SUBMITTERS_<sufijo> de la subdirección; mismo contrato que `adminGroupUuidOf`. */
export function submittersGroupUuidOf(community: Community): string | null {
  return community.metadata?.['digeex.submittersGroup']?.[0]?.value ?? null;
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
