import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { HalListResponse } from './models/hal.model';
import { Community } from './models/community.model';
import { Collection } from './models/collection.model';
import { Item } from './models/item.model';
import { Bitstream } from './models/bitstream.model';
import { SearchResponse, BundlesResponse, Bundle } from './models/search.model';

/**
 * Servicio principal para comunicación con la API REST de DSpace 9.
 * Todas las peticiones pasan por el proxy de Angular (/server → localhost:8080)
 * configurado en proxy.conf.json.
 * Las respuestas siguen el formato HAL+HATEOAS con _embedded, _links y page.
 */
@Injectable({ providedIn: 'root' })
export class DSpaceApiService {
  private readonly apiUrl = '/server/api';

  constructor(private readonly http: HttpClient) {}

  /** ─── Communities ─── */

  /**
   * Obtiene la lista paginada de comunidades de nivel superior.
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 20)
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
   * El parámetro opcional `embed` proyecta subrecursos en la misma
   * respuesta (ej. `adminGroup` para resolver el grupo destino al crear
   * un admin_subdireccion, según el contrato REST de DSpace 9.2).
   * @param uuid - UUID de la comunidad
   * @param options - `embed` con el nombre del subrecurso
   * @returns Observable con los datos de la comunidad
   */
  getCommunity(uuid: string, options: { embed?: string } = {}): Observable<Community> {
    let params = new HttpParams();
    if (options.embed) {
      params = params.set('embed', options.embed);
    }

    return this.http.get<Community>(
      `${this.apiUrl}/core/communities/${uuid}`,
      { params }
    );
  }

  /**
   * Obtiene las sub-comunidades de una comunidad padre.
   * @param parentUuid - UUID de la comunidad padre
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 20)
   * @returns Observable con lista HAL de sub-comunidades
   */
  getSubcommunities(parentUuid: string, page = 0, size = 20): Observable<HalListResponse<Community>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Community>>(
      `${this.apiUrl}/core/communities/${parentUuid}/subcommunities`,
      { params }
    );
  }

  /** ─── Collections ─── */

  /**
   * Obtiene todas las colecciones del repositorio (sin filtrar por comunidad).
   * Usado internamente por CollectionCacheService para llenar el caché.
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 100)
   * @returns Observable con lista HAL de colecciones
   */
  getAllCollections(page = 0, size = 100): Observable<HalListResponse<Collection>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Collection>>(
      `${this.apiUrl}/core/collections`,
      { params }
    );
  }

  /**
   * Obtiene las colecciones que pertenecen a una comunidad específica.
   * @param communityUuid - UUID de la comunidad padre
   * @param page - Número de página (default: 0)
   * @param size - Cantidad por página (default: 20)
   * @returns Observable con lista HAL de colecciones
   */
  getCollections(communityUuid: string, page = 0, size = 20): Observable<HalListResponse<Collection>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<HalListResponse<Collection>>(
      `${this.apiUrl}/core/communities/${communityUuid}/collections`,
      { params }
    );
  }

  /**
   * Obtiene una colección por su UUID.
   * El parámetro opcional `embed` anida subrecursos (ej. `submittersGroup`
   * para resolver el grupo destino al dar de alta personal_delegado).
   * @param uuid - UUID de la colección
   * @param options - `embed` con el nombre del subrecurso
   * @returns Observable con los datos de la colección
   */
  getCollection(uuid: string, options: { embed?: string } = {}): Observable<Collection> {
    let params = new HttpParams();
    if (options.embed) {
      params = params.set('embed', options.embed);
    }

    return this.http.get<Collection>(
      `${this.apiUrl}/core/collections/${uuid}`,
      { params }
    );
  }

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
