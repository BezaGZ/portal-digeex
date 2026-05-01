import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { VocabularyEntry } from './models/vocabulary-entry.model';
import { DSPACE_API_BASE, VOCABULARIES_PATH } from './dspace-rest.util';

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
 * Devuelve array plano de `VocabularyEntry`. Decisión asumida: si algún
 * vocabulario DIGEEX crece más allá de 20 entries (page size por defecto
 * de DSpace), cambiar la firma a `Paginated<VocabularyEntry>` y agregar
 * parámetros page/size. Hoy todos los vocabularios DIGEEX caben en una
 * sola página (el más grande es `tipos-documento` con 15 entries).
 */
@Injectable({ providedIn: 'root' })
export class VocabularyApiService {
  private readonly http = inject(HttpClient);

  /**
   * Devuelve los pares display/value del vocabulario `vocabularyName`.
   * Endpoint público en DSpace 9.x (no requiere autenticación). Descarta
   * `otherInformation` y `type` porque el frontend solo usa el par para
   * poblar los dropdowns de los formularios de submission.
   */
  getEntries(vocabularyName: string): Observable<VocabularyEntry[]> {
    return this.http
      .get<VocabularyEntriesResponse>(
        `${DSPACE_API_BASE}${VOCABULARIES_PATH}${vocabularyName}/entries`,
      )
      .pipe(
        map((response) =>
          response._embedded.entries.map((entry) => ({
            display: entry.display,
            value: entry.value,
          })),
        ),
      );
  }
}
