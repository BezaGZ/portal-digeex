export interface HalLink {
  href: string;
}

export interface HalLinks {
  self: HalLink;
  [key: string]: HalLink;
}

export interface HalPage {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface HalListResponse<T> {
  _embedded: { [key: string]: T[] };
  _links: HalLinks;
  page: HalPage;
}

/**
 * Forma aplanada de una lista paginada, lista para consumir
 * desde la UI sin tener que hablar HAL ni saber el nombre del
 * recurso dentro de `_embedded`.
 */
export interface Paginated<T> {
  items: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  page: number;
}
