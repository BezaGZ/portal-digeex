import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { HalListResponse } from './models/hal.model';
import { Community } from './models/community.model';
import { Collection } from './models/collection.model';
import { Item } from './models/item.model';
import { Bitstream } from './models/bitstream.model';
import { SearchResponse, BundlesResponse, Bundle } from './models/search.model';

/**
 * Servicio principal para comunicación con la API REST de DSpace 9.
 *
 * Todas las peticiones pasan por el proxy de Angular (`/server` → `localhost:8080`)
 * configurado en `proxy.conf.json`.
 *
 * Las respuestas siguen el formato HAL+HATEOAS con `_embedded`, `_links` y `page`.
 *
 * @see docs/02-desarrollo/04-arquitectura-frontend.md - Arquitectura de servicios
 * @see docs/03-testing/01-guia-testing.md - Testing de servicios HTTP
 */
@Injectable({ providedIn: 'root' })
export class DSpaceApiService {
  private readonly apiUrl = '/server/api';

  constructor(private readonly http: HttpClient) {}

  // ─── Communities ──────────────────────────────────────────

  /**
   * Obtiene la lista paginada de comunidades de nivel superior.
   *
   * @param page - Número de página (default: 0)
   * @param size - Tamaño de página (default: 20)
   * @returns Observable con lista HAL de comunidades
   */
  getCommunities(page = 0, size = 20): Observable<HalListResponse<Community>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Community>>(
      `${this.apiUrl}/core/communities`,
      { params }
    );
  }

  /**
   * Obtiene una comunidad por su UUID.
   *
   * @param uuid - UUID de la comunidad
   * @returns Observable con los datos de la comunidad
   */
  getCommunity(uuid: string): Observable<Community> {
    return this.http.get<Community>(
      `${this.apiUrl}/core/communities/${uuid}`
    );
  }

  /** Obtiene las sub-comunidades de una comunidad padre. */
  getSubcommunities(parentUuid: string, page = 0, size = 20): Observable<HalListResponse<Community>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Community>>(
      `${this.apiUrl}/core/communities/${parentUuid}/subcommunities`,
      { params }
    );
  }

  // ─── Collections ──────────────────────────────────────────

  /** Obtiene TODAS las colecciones del repositorio. */
  getAllCollections(page = 0, size = 100): Observable<HalListResponse<Collection>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Collection>>(
      `${this.apiUrl}/core/collections`,
      { params }
    );
  }

  /** Obtiene las colecciones de una comunidad. */
  getCollections(communityUuid: string, page = 0, size = 20): Observable<HalListResponse<Collection>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Collection>>(
      `${this.apiUrl}/core/communities/${communityUuid}/collections`,
      { params }
    );
  }

  /** Obtiene una colección por su UUID. */
  getCollection(uuid: string): Observable<Collection> {
    return this.http.get<Collection>(
      `${this.apiUrl}/core/collections/${uuid}`
    );
  }

  // ─── Items ────────────────────────────────────────────────

  getItems(collectionUuid: string, page = 0, size = 20): Observable<HalListResponse<Item>> {
    const params = new HttpParams()
      .set('scope', collectionUuid)
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

  /** Obtiene un ítem por su UUID. */
  getItem(uuid: string): Observable<Item> {
    return this.http.get<Item>(
      `${this.apiUrl}/core/items/${uuid}`
    );
  }

  // ─── Bitstreams ───────────────────────────────────────────

  /**
   * Retorna la URL del thumbnail de un ítem.
   *
   * DSpace sirve el thumbnail desde bundle THUMBNAIL o genera uno desde PDF.
   *
   * @param itemUuid - UUID del ítem
   * @returns URL del thumbnail
   */
  getThumbnailUrl(itemUuid: string): string {
    return `${this.apiUrl}/core/items/${itemUuid}/thumbnail`;
  }

  /**
   * Obtiene los bundles de un ítem.
   *
   * Bundles disponibles: ORIGINAL (PDFs), THUMBNAIL (portadas), LICENSE
   *
   * @param itemUuid - UUID del ítem
   * @param page - Número de página (default: 0)
   * @param size - Tamaño de página (default: 20)
   * @returns Observable con respuesta HAL de bundles
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
   * Obtiene los bitstreams de un bundle específico.
   *
   * @param bundleUuid - UUID del bundle
   * @param page - Número de página (default: 0)
   * @param size - Tamaño de página (default: 20)
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
   * Obtiene los bitstreams del bundle ORIGINAL de un ítem.
   *
   * En DSpace 9.2 los bitstreams se consultan en dos pasos:
   * 1. GET /api/core/items/{uuid}/bundles
   * 2. GET /api/core/bundles/{bundle-uuid}/bitstreams
   *
   * @param itemUuid - UUID del ítem
   * @param page - Número de página (default: 0)
   * @param size - Tamaño de página (default: 20)
   * @returns Observable con lista HAL de bitstreams del bundle ORIGINAL
   */
  getBitstreams(itemUuid: string, page = 0, size = 20): Observable<HalListResponse<Bitstream>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<BundlesResponse>(
      `${this.apiUrl}/core/items/${itemUuid}/bundles`,
      { params }
    ).pipe(
      switchMap((bundlesResponse) => {
        const bundles = bundlesResponse._embedded?.bundles || [];

        if (bundles.length === 0) {
          return new Observable<HalListResponse<Bitstream>>((observer) => {
            observer.next({
              _embedded: { bitstreams: [] },
              _links: { self: { href: '' } },
              page: { size: 0, totalElements: 0, totalPages: 0, number: 0 }
            });
            observer.complete();
          });
        }

        const originalBundle = bundles.find((b: Bundle) => b.name === 'ORIGINAL');

        if (!originalBundle) {
          return new Observable<HalListResponse<Bitstream>>((observer) => {
            observer.next({
              _embedded: { bitstreams: [] },
              _links: { self: { href: '' } },
              page: { size: 0, totalElements: 0, totalPages: 0, number: 0 }
            });
            observer.complete();
          });
        }

        const bundleUuid = originalBundle.uuid;
        return this.http.get<HalListResponse<Bitstream>>(
          `${this.apiUrl}/core/bundles/${bundleUuid}/bitstreams`,
          { params }
        );
      })
    );
  }
}
