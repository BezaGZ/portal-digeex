import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { VocabularyEntry } from './models/vocabulary-entry.model';
import { DSPACE_API_BASE, VOCABULARIES_PATH, paginateAll$ } from './dspace-rest.util';

/**
 * Shape literal que devuelve DSpace 9.x para
 * `/api/submission/vocabularies/{name}/entries`.
 * Fixtures en `test-fixtures/vocabularies-*.json`.
 */
interface VocabularyEntriesResponse {
  _embedded: {
    entries: Array<{
      display: string;
      value: string;
      otherInformation: object;
      type: string;
    }>;
  };
  page: {
    number: number;
    size: number;
    totalPages: number;
    totalElements: number;
  };
  _links: { self: { href: string } };
}

/**
 * Wrapper HTTP del recurso `/api/submission/vocabularies` de DSpace.
 *
 * `getEntries` devuelve el universo completo del vocabulario agotando todas
 * las páginas con `paginateAll$` sin pasar `size`; el backend usa su default
 * configurado (`spring.data.rest.default-page-size`) y reporta `totalPages`
 * coherente. La firma sin parámetros `page/size` ya promete "todas las
 * entries"; la implementación honra esa promesa sin imponer un tamaño de
 * página arbitrario desde el frontend.
 */
@Injectable({ providedIn: 'root' })
export class VocabularyApiService {
  private readonly http = inject(HttpClient);

  /**
   * Devuelve los pares display/value del vocabulario `vocabularyName`
   * iterando todas las páginas del endpoint hasta agotar `totalPages`.
   * Endpoint público en DSpace 9.x (no requiere autenticación). Descarta
   * `otherInformation` y `type` porque el frontend solo usa el par para
   * poblar los dropdowns de los formularios de submission.
   */
  getEntries(vocabularyName: string): Observable<VocabularyEntry[]> {
    return paginateAll$(
      (page) => this.fetchPage$(vocabularyName, page),
      (response) =>
        response._embedded.entries.map((entry) => ({
          display: entry.display,
          value: entry.value,
        })),
    );
  }

  /**
   * GET de una página específica del endpoint paginado HAL. La página 0 va
   * sin parámetros para preservar la URL canónica del recurso; las páginas
   * posteriores agregan `?page=N`. Spring Data REST acepta `page` sin `size`
   * y aplica su default configurado.
   */
  private fetchPage$(
    vocabularyName: string,
    page: number,
  ): Observable<VocabularyEntriesResponse> {
    const url = `${DSPACE_API_BASE}${VOCABULARIES_PATH}${vocabularyName}/entries`;
    return page === 0
      ? this.http.get<VocabularyEntriesResponse>(url)
      : this.http.get<VocabularyEntriesResponse>(url, {
          params: new HttpParams().set('page', String(page)),
        });
  }
}
