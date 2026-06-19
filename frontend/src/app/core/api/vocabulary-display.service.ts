import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import { VocabularyApiService } from './vocabulary-api.service';
import { VocabularyEntry } from './models/vocabulary-entry.model';

/**
 * Traduce el stored value de un vocabulario (codigo guardado en metadata) al
 * display label que se muestra al usuario. Lee los pares display/value via
 * VocabularyApiService y devuelve el label correspondiente; si la entrada no
 * existe, cae al value crudo para que la vista no rompa.
 *
 * Cachea la lista de entries por nombre de vocabulario con shareReplay(1)
 * para que un detalle con varios lookups (idioma, audience, type) o varios
 * items en una grilla peguen una sola vez al endpoint por sesion.
 */
@Injectable({ providedIn: 'root' })
export class VocabularyDisplayService {
  private readonly vocabApi = inject(VocabularyApiService);

  /** Observable cacheado por nombre de vocabulario; se reusa en cada display$. */
  private readonly cache = new Map<string, Observable<VocabularyEntry[]>>();

  display$(vocabularyName: string, storedValue: string): Observable<string> {
    return this.entries$(vocabularyName).pipe(
      map((entries) => entries.find((e) => e.value === storedValue)?.display ?? storedValue),
    );
  }

  /**
   * Devuelve el vocabulario completo como Map<storedValue, displayLabel>.
   * Útil cuando un consumer necesita resolver varias entries del mismo
   * vocabulario en una sola pasada (ej. los filtros de búsqueda que
   * traducen N facetas de language) sin disparar N llamadas display$.
   */
  displayMap$(vocabularyName: string): Observable<Map<string, string>> {
    return this.entries$(vocabularyName).pipe(
      map((entries) => new Map(entries.map((e) => [e.value, e.display]))),
    );
  }

  /**
   * Lista completa de entradas del vocabulario, cacheada por nombre con
   * `shareReplay(1)`. Pública para que los forms de submission pueblen sus
   * dropdowns reusando la misma caché que `display$`/`displayMap$`, en vez de
   * pegar a `VocabularyApiService.getEntries` por su cuenta en cada apertura.
   */
  entries$(vocabularyName: string): Observable<VocabularyEntry[]> {
    let cached = this.cache.get(vocabularyName);
    if (!cached) {
      cached = this.vocabApi.getEntries(vocabularyName).pipe(shareReplay(1));
      this.cache.set(vocabularyName, cached);
    }
    return cached;
  }
}
