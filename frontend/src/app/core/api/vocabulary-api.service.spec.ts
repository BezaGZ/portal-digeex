import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { VocabularyApiService } from './vocabulary-api.service';
import { VocabularyEntry } from './models/vocabulary-entry.model';
import nivelesFixture from './test-fixtures/vocabularies-niveles-educativos.json';
import programasFixture from './test-fixtures/vocabularies-programas-digeex.json';

/**
 * Tests de `VocabularyApiService`.
 *
 * Wrapper HTTP del recurso `/api/submission/vocabularies/{name}/entries` de
 * DSpace 9.x. `getEntries` itera todas las páginas con `expand` + `reduce`
 * sin pasar `size`, dejando que el backend use su default configurado y
 * agotando la iteración cuando `page.number + 1 >= page.totalPages`. Los
 * fixtures en `./test-fixtures/vocabularies-*.json` son el JSON literal que
 * DSpace devolvió contra la instancia DIGEEX el 30/04/2026.
 *
 * Ciclo 5 TDD — Sprint 6. Ajustado en Ciclo 1 (Sprint 7).
 */
describe('VocabularyApiService', () => {
  let service: VocabularyApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VocabularyApiService,
      ],
    });

    service = TestBed.inject(VocabularyApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Verifica que getEntries pegue al endpoint REST y devuelva un array de VocabularyEntry. */
  it('should GET /api/submission/vocabularies/{name}/entries and return an array of VocabularyEntry', () => {
    let result: VocabularyEntry[] | undefined;
    service.getEntries('niveles-educativos').subscribe((entries) => (result = entries));

    const req = httpMock.expectOne('/server/api/submission/vocabularies/niveles-educativos/entries');
    expect(req.request.method).toBe('GET');
    req.flush(nivelesFixture);

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  /** Verifica que el fixture real de programas-digeex resuelva con las 12 entradas que devolvió DSpace. */
  it('should return 12 entries for programas-digeex', () => {
    let result: VocabularyEntry[] | undefined;
    service.getEntries('programas-digeex').subscribe((entries) => (result = entries));

    httpMock
      .expectOne('/server/api/submission/vocabularies/programas-digeex/entries')
      .flush(programasFixture);

    expect(result!.length).toBe(12);
  });

  /** Verifica que cada entry se reduzca al par { display, value } descartando otherInformation y type. */
  it('should map each entry to { display, value } and discard otherInformation and type', () => {
    let result: VocabularyEntry[] | undefined;
    service.getEntries('niveles-educativos').subscribe((entries) => (result = entries));

    httpMock
      .expectOne('/server/api/submission/vocabularies/niveles-educativos/entries')
      .flush(nivelesFixture);

    expect(result![0]).toEqual({ display: 'Primaria', value: 'Primaria' });
    expect(Object.keys(result![0]).sort()).toEqual(['display', 'value']);
  });

  /** Verifica que el observable propague el error HTTP cuando el endpoint responde 404. */
  it('should propagate the error when the endpoint returns 404', () => {
    let capturedError: { status: number } | undefined;
    service.getEntries('inexistente').subscribe({
      next: () => {
        throw new Error('no debería emitir un valor para 404');
      },
      error: (err) => (capturedError = err),
    });

    httpMock
      .expectOne('/server/api/submission/vocabularies/inexistente/entries')
      .flush({ status: 404, error: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    expect(capturedError).toBeDefined();
    expect(capturedError!.status).toBe(404);
  });

  /**
   * Verifica que getEntries itere todas las páginas y concatene las entries en orden.
   * Espejea idiomas-digeex en runtime: 29 entries, default del backend size=20, totalPages=2.
   */
  it('should iterate all pages until totalPages is exhausted and concatenate entries in order', () => {
    let result: VocabularyEntry[] | undefined;
    service.getEntries('idiomas-digeex').subscribe((entries) => (result = entries));

    const page0 = {
      _embedded: {
        entries: Array.from({ length: 20 }, (_, i) => ({
          display: `Idioma ${i + 1}`,
          value: `idioma-${i + 1}`,
          otherInformation: {},
          type: 'vocabularyEntry',
        })),
      },
      page: { number: 0, size: 20, totalPages: 2, totalElements: 29 },
      _links: { self: { href: 'http://localhost:8080/server/api/submission/vocabularies/idiomas-digeex/entries' } },
    };
    const page1 = {
      _embedded: {
        entries: Array.from({ length: 9 }, (_, i) => ({
          display: `Idioma ${i + 21}`,
          value: `idioma-${i + 21}`,
          otherInformation: {},
          type: 'vocabularyEntry',
        })),
      },
      page: { number: 1, size: 20, totalPages: 2, totalElements: 29 },
      _links: { self: { href: 'http://localhost:8080/server/api/submission/vocabularies/idiomas-digeex/entries?page=1' } },
    };

    httpMock
      .expectOne('/server/api/submission/vocabularies/idiomas-digeex/entries')
      .flush(page0);
    httpMock
      .expectOne('/server/api/submission/vocabularies/idiomas-digeex/entries?page=1')
      .flush(page1);

    expect(result).toBeDefined();
    expect(result!.length).toBe(29);
    expect(result![0]).toEqual({ display: 'Idioma 1', value: 'idioma-1' });
    expect(result![19]).toEqual({ display: 'Idioma 20', value: 'idioma-20' });
    expect(result![20]).toEqual({ display: 'Idioma 21', value: 'idioma-21' });
    expect(result![28]).toEqual({ display: 'Idioma 29', value: 'idioma-29' });
  });

  /**
   * Verifica que un error en una página no-inicial propague sin emitir entries parciales.
   * El observable no debe entregar los entries de la página exitosa como resultado intermedio.
   */
  it('should propagate the error from a non-first page without emitting partial entries', () => {
    let capturedError: { status: number } | undefined;
    let resultEmitted = false;

    service.getEntries('idiomas-digeex').subscribe({
      next: () => {
        resultEmitted = true;
      },
      error: (err) => (capturedError = err),
    });

    httpMock
      .expectOne('/server/api/submission/vocabularies/idiomas-digeex/entries')
      .flush({
        _embedded: {
          entries: Array.from({ length: 20 }, (_, i) => ({
            display: `e${i}`,
            value: `v${i}`,
            otherInformation: {},
            type: 'vocabularyEntry',
          })),
        },
        page: { number: 0, size: 20, totalPages: 2, totalElements: 29 },
        _links: { self: { href: 'http://localhost:8080/server/api/submission/vocabularies/idiomas-digeex/entries' } },
      });

    httpMock
      .expectOne('/server/api/submission/vocabularies/idiomas-digeex/entries?page=1')
      .flush({ status: 500, error: 'Server Error' }, { status: 500, statusText: 'Server Error' });

    expect(resultEmitted).toBe(false);
    expect(capturedError).toBeDefined();
    expect(capturedError!.status).toBe(500);
  });
});
