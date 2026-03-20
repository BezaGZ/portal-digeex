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
 */
@Injectable({ providedIn: 'root' })
export class DSpaceApiService {
  private readonly apiUrl = '/server/api';

  constructor(private readonly http: HttpClient) {}

  // ─── Communities ──────────────────────────────────────────

  /** Obtiene la lista paginada de comunidades de nivel superior. */
  getCommunities(page = 0, size = 20): Observable<HalListResponse<Community>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Community>>(
      `${this.apiUrl}/core/communities`,
      { params }
    );
  }

  /** Obtiene una comunidad por su UUID. */
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
   * Obtiene los bitstreams (archivos) de un ítem.
   *
   * IMPORTANTE: En DSpace 9.2, los bitstreams se obtienen navegando por:
   * 1. /api/core/items/{uuid}/bundles
   * 2. /api/core/bundles/{bundle-uuid}/bitstreams
   *
   * Este método obtiene todos los bundles del ítem y luego extrae todos
   * los bitstreams, retornándolos en un formato compatible con HalListResponse.
   */
  getBitstreams(itemUuid: string, page = 0, size = 20): Observable<HalListResponse<Bitstream>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    // Primero obtener los bundles del ítem
    return this.http.get<BundlesResponse>(
      `${this.apiUrl}/core/items/${itemUuid}/bundles`,
      { params }
    ).pipe(
      switchMap((bundlesResponse) => {
        const bundles = bundlesResponse._embedded?.bundles || [];

        // Si no hay bundles, retornar respuesta vacía
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

        // Obtener el bundle ORIGINAL (donde están los archivos principales)
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

        // Obtener los bitstreams del bundle ORIGINAL
        const bundleUuid = originalBundle.uuid;
        return this.http.get<HalListResponse<Bitstream>>(
          `${this.apiUrl}/core/bundles/${bundleUuid}/bitstreams`,
          { params }
        );
      })
    );
  }
}
