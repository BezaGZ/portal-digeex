export interface MetadataValue {
  value: string;
  language: string | null;
  authority: string | null;
  confidence: number;
  place: number;
}

export type MetadataMap = Record<string, MetadataValue[]>;
