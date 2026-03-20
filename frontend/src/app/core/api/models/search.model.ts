import { Item } from './item.model';
import { HalLinks, HalPage } from './hal.model';

/**
 * Objeto de búsqueda de DSpace que envuelve un objeto indexable.
 * Usado en respuestas de la API de búsqueda/descubrimiento.
 */
export interface SearchObject {
  _embedded: {
    indexableObject: Item;
  };
  _links: HalLinks;
  hitHighlights: Record<string, unknown>;
}

/**
 * Respuesta de la API de búsqueda/descubrimiento de DSpace.
 */
export interface SearchResponse {
  _embedded: {
    searchResult: {
      _embedded: {
        objects: SearchObject[];
      };
      page: HalPage;
    };
  };
  _links: HalLinks;
}

/**
 * Bundle de DSpace que contiene bitstreams.
 * Ej: ORIGINAL, THUMBNAIL, LICENSE
 */
export interface Bundle {
  uuid: string;
  name: string;
  handle: string;
  type: string;
  _links: HalLinks;
}

/**
 * Respuesta de bundles de un item.
 */
export interface BundlesResponse {
  _embedded: {
    bundles: Bundle[];
  };
  _links: HalLinks;
  page: HalPage;
}
