import { MetadataMap } from './metadata.model';

export interface BitstreamCheckSum {
  checkSumAlgorithm: string;
  value: string;
}

export interface Bitstream {
  uuid: string;
  name: string | null;
  handle: string | null;
  metadata: MetadataMap;
  sizeBytes: number;
  checkSum: BitstreamCheckSum;
  sequenceId: number | null;
  type: string;
}
