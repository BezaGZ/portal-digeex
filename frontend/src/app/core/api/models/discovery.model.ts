import { Item } from './item.model';

export interface FacetFilter {
  name: string;
  value: string;
  operator: string;
}

export interface FacetValue {
  label: string;
  count: number;
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
}

export interface SearchResult {
  items: Item[];
  facets: Facet[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
