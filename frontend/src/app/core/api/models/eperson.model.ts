import { MetadataMap } from './metadata.model';
import { HalListResponse } from './hal.model';
import { Group } from './group.model';

/**
 * Subrecursos que DSpace incluye en `_embedded` cuando la petición
 * usa el parámetro `embed` (por ejemplo `?embed=groups`). El bloque
 * es opcional porque los GET sin embed no lo traen.
 */
export interface EPersonEmbedded {
  groups?: HalListResponse<Group>;
}

export interface EPerson {
  uuid: string;
  name: string;
  handle: string | null;
  metadata: MetadataMap;
  netid: string | null;
  lastActive: string | null;
  canLogIn: boolean;
  email: string;
  requireCertificate: boolean;
  selfRegistered: boolean;
  type: string;
  _embedded?: EPersonEmbedded;
}
