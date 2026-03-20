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
