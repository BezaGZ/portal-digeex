import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SearchResponse } from './models/search.model';
import { SearchParams, SearchResult, Facet } from './models/discovery.model';
import { Item } from './models/item.model';
import { Bitstream } from './models/bitstream.model';

/**
 * Servicio que encapsula la Discovery API de DSpace (Apache Solr).
 * Todas las búsquedas con filtros, facetas y texto completo pasan por aquí.
 * El endpoint base es /api/discover/search/objects.
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly apiUrl = '/server/api';

  constructor(private readonly http: HttpClient) {}

  /**
   * Ejecuta una búsqueda en Discovery con los parámetros dados.
   * Devuelve ítems, facetas y datos de paginación.
   * Si se pasa size=0, solo devuelve facetas sin ítems (útil para llenar dropdowns).
   * @param params - Parámetros de búsqueda (query, scope, filters, page, size, sort)
   * @returns Observable con los resultados mapeados a SearchResult
   */
  search(params: SearchParams = {}): Observable<SearchResult> {
    return this.http.get<SearchResponse>(
      `${this.apiUrl}/discover/search/objects`,
      { params: this.buildSearchParams(params) }
    ).pipe(
      map((response) => this.mapResponse(response))
    );
  }

  /**
   * Construye los HttpParams a partir de los parámetros de búsqueda.
   * Los filtros se agregan como f.nombre=valor,operador (formato que espera DSpace).
   * @param params - Parámetros de búsqueda del frontend
   * @returns HttpParams listos para enviar al backend
   */
  private buildSearchParams(params: SearchParams): HttpParams {
    let httpParams = new HttpParams()
      .set('page', params.page ?? 0)
      .set('size', params.size ?? 20)
      .set('embed', 'thumbnail');

    if (params.query) {
      httpParams = httpParams.set('query', params.query);
    }

    if (params.scope) {
      httpParams = httpParams.set('scope', params.scope);
    }

    if (params.sort) {
      httpParams = httpParams.set('sort', params.sort);
    }

    if (params.configuration) {
      httpParams = httpParams.set('configuration', params.configuration);
    }

    if (params.filters) {
      for (const filter of params.filters) {
        httpParams = httpParams.append(`f.${filter.name}`, `${filter.value},${filter.operator}`);
      }
    }

    return httpParams;
  }

  /**
   * Transforma la respuesta cruda de DSpace (HAL+HATEOAS) al modelo limpio SearchResult.
   * Extrae ítems del objeto anidado searchResult._embedded.objects y
   * la paginación de searchResult.page.
   * @param response - Respuesta cruda de la Discovery API
   * @returns SearchResult con ítems, facetas, totales y paginación
   */
  private mapResponse(response: SearchResponse): SearchResult {
    const objects = response._embedded?.searchResult?._embedded?.objects || [];
    const items = objects
      .filter((obj) => obj._embedded?.indexableObject?.type === 'item')
      .map((obj) => {
        const ix = obj._embedded.indexableObject as Item & {
          _embedded?: { thumbnail?: Bitstream };
        };
        const thumbnail = ix._embedded?.thumbnail;
        return thumbnail ? { ...ix, thumbnail } : ix;
      });

    const page = response._embedded?.searchResult?.page;
    const facets = this.mapFacets(response);

    return {
      items,
      facets,
      totalElements: page?.totalElements ?? 0,
      totalPages: page?.totalPages ?? 0,
      page: page?.number ?? 0,
      size: page?.size ?? 20,
    };
  }

  /**
   * Extrae las facetas de la respuesta de Discovery y las simplifica.
   * Cada faceta tiene nombre y arreglo de valores con label y count.
   * @param response - Respuesta cruda de la Discovery API
   * @returns Arreglo de Facet simplificadas
   */
  private mapFacets(response: SearchResponse): Facet[] {
    const rawFacets = response._embedded?.facets || [];
    return rawFacets.map((facet) => ({
      name: facet.name,
      values: (facet._embedded?.values || []).map((v) => ({
        label: v.label,
        count: v.count,
      })),
    }));
  }
}
