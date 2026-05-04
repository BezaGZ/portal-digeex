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
 * Wrapper HTTP del recurso `/api/submission/vocabularies/{name}/entries`.
 * Los fixtures en `./test-fixtures/vocabularies-*.json` son el JSON literal
 * que DSpace 9.x devolvió contra la instancia DIGEEX el 30/04/2026
 * (anclaje empírico del Ciclo 5).
 *
 * Ciclo 5 TDD — Sprint 6.
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

  it('should GET /api/submission/vocabularies/{name}/entries and return an array of VocabularyEntry', () => {
    let result: VocabularyEntry[] | undefined;
    service.getEntries('niveles-educativos').subscribe((entries) => (result = entries));

    const req = httpMock.expectOne('/server/api/submission/vocabularies/niveles-educativos/entries');
    expect(req.request.method).toBe('GET');
    req.flush(nivelesFixture);

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return 12 entries for programas-digeex', () => {
    let result: VocabularyEntry[] | undefined;
    service.getEntries('programas-digeex').subscribe((entries) => (result = entries));

    httpMock
      .expectOne('/server/api/submission/vocabularies/programas-digeex/entries')
      .flush(programasFixture);

    expect(result!.length).toBe(12);
  });

  it('should map each entry to { display, value } and discard otherInformation and type', () => {
    let result: VocabularyEntry[] | undefined;
    service.getEntries('niveles-educativos').subscribe((entries) => (result = entries));

    httpMock
      .expectOne('/server/api/submission/vocabularies/niveles-educativos/entries')
      .flush(nivelesFixture);

    expect(result![0]).toEqual({ display: 'Primaria', value: 'Primaria' });
    expect(Object.keys(result![0]).sort()).toEqual(['display', 'value']);
  });

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
});
