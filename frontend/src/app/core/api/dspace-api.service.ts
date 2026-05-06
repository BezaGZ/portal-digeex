import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { HalListResponse } from './models/hal.model';
import { Item } from './models/item.model';
import { Bitstream } from './models/bitstream.model';
import { SearchResponse, BundlesResponse, Bundle } from './models/search.model';

/**
 * Servicio HTTP para los recursos Item y Bitstream de DSpace 9.
 *
 * Cubre búsqueda y getOne de items, listado de bundles, listado de bitstreams
 * por bundle, descarga del bundle ORIGINAL y URL del thumbnail.
 *
 * Las peticiones pasan por el proxy de Angular (/server → localhost:8080)
 * configurado en proxy.conf.json. Las respuestas siguen el formato HAL+HATEOAS
 * con _embedded, _links y page.
 */
@Injectable({ providedIn: 'root' })
export class DSpaceApiService {
  private readonly apiUrl = '/server/api';

  constructor(private readonly http: HttpClient) {}

  /** ─── Items ─── */

  /**
   * Obtiene los ítems de una colección usando Discovery (Solr).
   * La respuesta HAL viene anidada en searchResult._embedded.objects,
   * así que este método la transforma a un HalListResponse<Item> limpio.
   * @param collectionUuid - UUID de la colección (scope)
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 20)
   * @returns Observable con lista HAL de ítems
   */
  getItems(collectionUuid: string, page = 0, size = 20): Observable<HalListResponse<Item>> {
    // dsoType=item es clave: sin él Discovery cuenta también communities y
    // collections dentro del scope, inflando totalElements en quien usa el
    // método para contar items recursivos.
    const params = new HttpParams()
      .set('scope', collectionUuid)
      .set('dsoType', 'item')
      .set('page', page)
      .set('size', size);

    return this.http.get<SearchResponse>(
      `${this.apiUrl}/discover/search/objects`,
      { params }
    ).pipe(
      map((response) => {
        const objects = response._embedded?.searchResult?._embedded?.objects || [];
        const items = objects
          .filter((obj) => obj._embedded?.indexableObject?.type === 'item')
          .map((obj) => obj._embedded.indexableObject);

        return {
          _embedded: { items },
          _links: response._links,
          page: response._embedded?.searchResult?.page
        } as HalListResponse<Item>;
      })
    );
  }

  /**
   * Obtiene un ítem por su UUID.
   * @param uuid - UUID del ítem
   * @returns Observable con los datos del ítem incluyendo toda su metadata
   */
  getItem(uuid: string): Observable<Item> {
    return this.http.get<Item>(
      `${this.apiUrl}/core/items/${uuid}`
    );
  }

  /** ─── Bitstreams ─── */

  /**
   * Construye la URL del thumbnail de un ítem.
   * DSpace lo sirve desde el bundle THUMBNAIL o genera uno desde PDF.
   * @param itemUuid - UUID del ítem
   * @returns URL del thumbnail
   */
  getThumbnailUrl(itemUuid: string): string {
    return `${this.apiUrl}/core/items/${itemUuid}/thumbnail`;
  }

  /**
   * Obtiene los bundles de un ítem (ORIGINAL, THUMBNAIL, LICENSE, etc.).
   * @param itemUuid - UUID del ítem
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 20)
   * @returns Observable con respuesta de bundles
   */
  getBundles(itemUuid: string, page = 0, size = 20): Observable<BundlesResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<BundlesResponse>(
      `${this.apiUrl}/core/items/${itemUuid}/bundles`,
      { params }
    );
  }

  /**
   * Obtiene los bitstreams (archivos) de un bundle específico.
   * @param bundleUuid - UUID del bundle
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 20)
   * @returns Observable con lista HAL de bitstreams
   */
  getBitstreamsFromBundle(bundleUuid: string, page = 0, size = 20): Observable<HalListResponse<Bitstream>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Bitstream>>(
      `${this.apiUrl}/core/bundles/${bundleUuid}/bitstreams`,
      { params }
    );
  }

  /**
   * Obtiene los bitstreams del bundle ORIGINAL de un ítem en dos pasos:
   * 1) GET /items/{uuid}/bundles → busca el bundle ORIGINAL
   * 2) GET /bundles/{uuid}/bitstreams → devuelve los archivos
   * Si no existe bundle ORIGINAL, devuelve arreglo vacío.
   * @param itemUuid - UUID del ítem
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 20)
   * @returns Observable con lista HAL de bitstreams del bundle ORIGINAL
   */
  getBitstreams(itemUuid: string, page = 0, size = 20): Observable<HalListResponse<Bitstream>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    const emptyResponse: HalListResponse<Bitstream> = {
      _embedded: { bitstreams: [] },
      _links: { self: { href: '' } },
      page: { size: 0, totalElements: 0, totalPages: 0, number: 0 },
    };

    return this.http.get<BundlesResponse>(
      `${this.apiUrl}/core/items/${itemUuid}/bundles`,
      { params }
    ).pipe(
      switchMap((bundlesResponse) => {
        const bundles = bundlesResponse._embedded?.bundles || [];
        const originalBundle = bundles.find((b: Bundle) => b.name === 'ORIGINAL');

        if (!originalBundle) {
          return of(emptyResponse);
        }

        return this.http.get<HalListResponse<Bitstream>>(
          `${this.apiUrl}/core/bundles/${originalBundle.uuid}/bitstreams`,
          { params }
        );
      })
    );
  }
}
