import { Item } from './item.model';

export interface FacetFilter {
  name: string;
  value: string;
  operator: string;
}

export interface FacetValue {
  label: string;
  count: number;
  /**
   * Identificador opcional que DSpace provee para facets cuyos valores son
   * DSO (colecciones, comunidades, items). Queda `undefined` para facets
   * sobre metadata pura (entityType, language, dateIssued).
   */
  authorityKey?: string;
}

export interface Facet {
  name: string;
  values: FacetValue[];
}

export interface SearchParams {
  query?: string;
  scope?: string;
  filters?: FacetFilter[];
  page?: number;
  size?: number;
  sort?: string;
  /** Configuration bean del backend (`default`, `administrativeView`, etc.). */
  configuration?: string;
}

export interface SearchResult {
  items: Item[];
  facets: Facet[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
