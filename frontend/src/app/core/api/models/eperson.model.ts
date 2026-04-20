import { MetadataMap } from './metadata.model';

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
}
