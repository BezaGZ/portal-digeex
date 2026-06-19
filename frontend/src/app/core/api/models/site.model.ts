import { HalLinks } from './hal.model';

/**
 * Site raiz del repositorio DSpace (el unico DSO de tipo site). Se modelan
 * solo los campos que el portal consume: el uuid y el self href que
 * `usagereports/search/object` necesita como scope.
 */
export interface Site {
  uuid: string;
  handle?: string;
  _links: HalLinks;
}
