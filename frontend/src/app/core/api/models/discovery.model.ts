import { Item } from './item.model';

export interface FacetFilter {
  name: string;
  value: string;
  operator: string;
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
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
