import { HttpParams } from '@angular/common/http';
import { HalListResponse, Paginated } from './models/hal.model';

/**
 * Constantes y utilidades compartidas del contrato REST de DSpace 9.2.
 *
 * Agrupa lo que está realmente duplicado entre wrappers del core/api
 * (paths de colecciones, content types propios del contrato, mapeo de
 * respuestas HAL y construcción de parámetros de paginación). No es una
 * base class: son funciones puras que se importan donde hacen falta.
 *
 * Se mantiene intencionalmente mínimo. Lo que dspace-angular resuelve
 * con ngrx + RemoteData + ObjectCacheService no aplica a este portal
 * porque el estado reactivo vive en signals y los casos con caché se
 * resuelven localmente con shareReplay.
 */

/** Prefijo que DSpace usa para todos los endpoints REST. */
export const DSPACE_API_BASE = '/server/api';

/** Paths de las colecciones principales que más de un wrapper necesita. */
export const EPERSONS_COLLECTION_PATH = '/eperson/epersons';
export const GROUPS_COLLECTION_PATH = '/eperson/groups';
export const REGISTRATIONS_COLLECTION_PATH = '/eperson/registrations';
export const SUBMISSIONFORMS_PATH = '/config/submissionforms/';
export const VOCABULARIES_PATH = '/submission/vocabularies/';
export const COMMUNITIES_PATH = '/core/communities';
export const COLLECTIONS_PATH = '/core/collections';
export const ITEMS_PATH = '/core/items';

/**
 * Content-Type que DSpace exige para los endpoints que reciben hrefs
 * como cuerpo (por ejemplo, al agregar un eperson a un grupo).
 */
export const URI_LIST_CONTENT_TYPE = 'text/uri-list';

/**
 * Keys del objeto `_embedded` que devuelven los listados HAL. DSpace
 * usa el plural del recurso, y mapHalList() necesita recibirlo explícito
 * porque cada colección trae un key distinto.
 */
export const EMBEDDED_KEY_EPERSONS = 'epersons';
export const EMBEDDED_KEY_GROUPS = 'groups';

/**
 * Arma HttpParams agregando solo los valores que vinieron definidos.
 * Evita mandar `size=undefined` o `page=undefined` al backend, que
 * DSpace interpretaría de forma distinta a no pasar el parámetro.
 */
export function buildPaginationParams(params: { size?: number; page?: number }): HttpParams {
  let httpParams = new HttpParams();

  if (params.size !== undefined) {
    httpParams = httpParams.set('size', String(params.size));
  }

  if (params.page !== undefined) {
    httpParams = httpParams.set('page', String(params.page));
  }

  return httpParams;
}

/**
 * Aplana una respuesta HAL de DSpace a Paginated<T>. El embeddedKey es
 * el nombre del array dentro de `_embedded` (por ejemplo, 'epersons'
 * o 'groups'). `page.number` se expone como `page` para que el
 * frontend no tenga que conocer la nomenclatura HAL.
 */
export function mapHalList<T>(response: HalListResponse<T>, embeddedKey: string): Paginated<T> {
  return {
    items: response._embedded?.[embeddedKey] ?? [],
    totalElements: response.page.totalElements,
    totalPages: response.page.totalPages,
    size: response.page.size,
    page: response.page.number,
  };
}

/**
 * Construye una URL absoluta al API de DSpace para usar como cuerpo en
 * POST con Content-Type text/uri-list. DSpace espera `http(s)://host/
 * server/api/...`, no la ruta relativa, porque en ese formato el hred
 * es el identificador completo del recurso.
 */
export function buildAbsoluteApiUrl(relativePath: string): string {
  return `${window.location.origin}${DSPACE_API_BASE}${relativePath}`;
}

/**
 * Devuelve el uuid que aparece al final de un href HAL. Útil para leer
 * `_links.object.href` de un grupo y resolver el DSO dueño (community
 * o collection) contra el wrapper correspondiente.
 */
export function extractUuidFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const clean = href.split('?')[0].split('#')[0];
  const segments = clean.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}
