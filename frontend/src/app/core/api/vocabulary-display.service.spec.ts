import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { VocabularyDisplayService } from './vocabulary-display.service';
import { VocabularyApiService } from './vocabulary-api.service';
import { VocabularyEntry } from './models/vocabulary-entry.model';

/**
 * Tests de VocabularyDisplayService.
 *
 * Servicio que traduce stored value (codigo guardado en metadata) al display
 * label visible para el usuario, leyendo los pares display/value del vocabulario
 * via VocabularyApiService. Cachea por nombre de vocabulario para no repegar
 * en cada lookup, y cae al value crudo si la entrada no existe (graceful).
 *
 * Ciclo 28 TDD - Sprint 6.
 */
describe('VocabularyDisplayService', () => {
  let service: VocabularyDisplayService;
  let vocabApi: VocabularyApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(VocabularyDisplayService);
    vocabApi = TestBed.inject(VocabularyApiService);
  });

  /** Verifica que display$ resuelva el label cuando el stored value existe en el vocabulario. */
  it('should resolve display label for stored value when entry exists', () => {
    const idiomas: VocabularyEntry[] = [
      { display: 'Español', value: 'es' },
      { display: 'Achi', value: 'acr' },
    ];
    vi.spyOn(vocabApi, 'getEntries').mockReturnValue(of(idiomas));

    let result: string | undefined;
    service.display$('idiomas-digeex', 'acr').subscribe((label) => (result = label));

    expect(result).toBe('Achi');
    expect(vocabApi.getEntries).toHaveBeenCalledWith('idiomas-digeex');
  });

  /**
   * Verifica que display$ caiga al stored value crudo cuando no hay entry coincidente.
   * Evita renderizar undefined cuando el vocabulario no contiene el código guardado.
   */
  it('should fall back to the stored value when entry is not found', () => {
    const idiomas: VocabularyEntry[] = [{ display: 'Español', value: 'es' }];
    vi.spyOn(vocabApi, 'getEntries').mockReturnValue(of(idiomas));

    let result: string | undefined;
    service.display$('idiomas-digeex', 'xyz').subscribe((label) => (result = label));

    // Si el value no esta en el vocabulario, el componente debe ver el codigo
    // crudo en lugar de un undefined que rompe el render.
    expect(result).toBe('xyz');
  });

  /** Verifica que las entries se cacheen por nombre de vocabulario y no se repita la llamada HTTP. */
  it('should cache vocabulary entries and not call the API twice for the same name', () => {
    const idiomas: VocabularyEntry[] = [
      { display: 'Español', value: 'es' },
      { display: 'Achi', value: 'acr' },
    ];
    const spy = vi.spyOn(vocabApi, 'getEntries').mockReturnValue(of(idiomas));

    service.display$('idiomas-digeex', 'acr').subscribe();
    service.display$('idiomas-digeex', 'es').subscribe();
    service.display$('idiomas-digeex', 'acr').subscribe();

    // Una sola llamada HTTP por nombre de vocabulario, los lookups subsecuentes
    // se resuelven contra la lista cacheada en memoria.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  /** Verifica que displayMap$ retorne un Map<storedValue, displayLabel> con todas las entries. */
  it('should expose displayMap$ that returns a Map<storedValue, displayLabel>', () => {
    const idiomas: VocabularyEntry[] = [
      { display: 'Español', value: 'es' },
      { display: 'Achi', value: 'acr' },
      { display: "K'iche'", value: 'quc' },
    ];
    vi.spyOn(vocabApi, 'getEntries').mockReturnValue(of(idiomas));

    let result: Map<string, string> | undefined;
    service.displayMap$('idiomas-digeex').subscribe((map) => (result = map));

    // displayMap$ resuelve la traducción bulk en una sola pasada cuando un
    // consumer (ej. el filtro de búsqueda) necesita varias entries del
    // mismo vocabulario sin disparar N display$.
    expect(result).toBeDefined();
    expect(result!.get('es')).toBe('Español');
    expect(result!.get('acr')).toBe('Achi');
    expect(result!.get('quc')).toBe("K'iche'");
    expect(result!.size).toBe(3);
  });

  /** Verifica que cada vocabulario se cachee de forma independiente y comparta el cache entre lookups. */
  it('should fetch each vocabulary independently', () => {
    const idiomas: VocabularyEntry[] = [{ display: 'Español', value: 'es' }];
    const niveles: VocabularyEntry[] = [{ display: 'Primaria', value: 'Primaria' }];
    const spy = vi.spyOn(vocabApi, 'getEntries').mockImplementation((name: string) => {
      if (name === 'idiomas-digeex') return of(idiomas);
      if (name === 'niveles-educativos') return of(niveles);
      return of([]);
    });

    let idiomaResult: string | undefined;
    let nivelResult: string | undefined;
    service.display$('idiomas-digeex', 'es').subscribe((label) => (idiomaResult = label));
    service.display$('niveles-educativos', 'Primaria').subscribe((label) => (nivelResult = label));
    service.display$('idiomas-digeex', 'es').subscribe(); // segundo lookup mismo vocab

    // Cada vocabulario tiene su propia entrada en el cache; el segundo lookup
    // de idiomas-digeex no agrega una nueva llamada.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('idiomas-digeex');
    expect(spy).toHaveBeenCalledWith('niveles-educativos');
    expect(idiomaResult).toBe('Español');
    expect(nivelResult).toBe('Primaria');
  });
});
