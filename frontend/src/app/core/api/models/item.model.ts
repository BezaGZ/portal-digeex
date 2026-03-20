import { MetadataMap } from './metadata.model';

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
}
