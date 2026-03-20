import { MetadataMap } from './metadata.model';

export interface Community {
  uuid: string;
  name: string;
  handle: string;
  metadata: MetadataMap;
  archivedItemsCount: number;
  type: string;
}
