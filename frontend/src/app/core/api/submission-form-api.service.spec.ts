import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SubmissionFormApiService } from './submission-form-api.service';
import { SubmissionForm } from './models/submission-form.model';
import { DIGEEX_FORM } from '../config/digeex-values.config';
import galeriaFixture from './test-fixtures/submissionforms-digeex-galeria.json';

/**
 * Tests de `SubmissionFormApiService`.
 *
 * Wrapper HTTP del recurso `/api/config/submissionforms/{name}`. Los fixtures
 * en `./test-fixtures/` son el JSON literal que DSpace 9.x.
 *
 * Ciclo 4 TDD — Sprint 6.
 */
describe('SubmissionFormApiService', () => {
  let service: SubmissionFormApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SubmissionFormApiService,
      ],
    });

    service = TestBed.inject(SubmissionFormApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should GET /api/config/submissionforms/{name} and return the SubmissionForm with id and name', () => {
    let result: SubmissionForm | undefined;
    service.getForm('digeex-galeria').subscribe((form) => (result = form));

    const req = httpMock.expectOne('/server/api/config/submissionforms/digeex-galeria');
    expect(req.request.method).toBe('GET');
    req.flush(galeriaFixture);

    expect(result).toBeDefined();
    expect(result!.id).toBe('digeex-galeria');
    expect(result!.name).toBe('digeex-galeria');
  });

  it('should flatten rows[].fields[] into a fields[] array with 8 elements for digeex-galeria', () => {
    let result: SubmissionForm | undefined;
    service.getForm('digeex-galeria').subscribe((form) => (result = form));

    httpMock.expectOne('/server/api/config/submissionforms/digeex-galeria').flush(galeriaFixture);

    expect(result!.fields).toBeDefined();
    expect(result!.fields.length).toBe(8);
  });

  it('should preserve vocabularyName when the field has controlledVocabulary (Tipo de evento)', () => {
    let result: SubmissionForm | undefined;
    service.getForm('digeex-galeria').subscribe((form) => (result = form));

    httpMock.expectOne('/server/api/config/submissionforms/digeex-galeria').flush(galeriaFixture);

    const tipoEvento = result!.fields.find((f) => f.metadata === 'dc.type');
    expect(tipoEvento).toBeDefined();
    expect(tipoEvento!.vocabularyName).toBe('tipos-evento');
  });

  it('should leave vocabularyName undefined when the field has NO controlledVocabulary (Título del álbum)', () => {
    let result: SubmissionForm | undefined;
    service.getForm('digeex-galeria').subscribe((form) => (result = form));

    httpMock.expectOne('/server/api/config/submissionforms/digeex-galeria').flush(galeriaFixture);

    const titulo = result!.fields.find((f) => f.metadata === 'dc.title');
    expect(titulo).toBeDefined();
    expect(titulo!.vocabularyName).toBeUndefined();
  });

  it('should leave mandatoryMessage undefined when the field is optional (Tipo de población)', () => {
    let result: SubmissionForm | undefined;
    service.getForm('digeex-galeria').subscribe((form) => (result = form));

    httpMock.expectOne('/server/api/config/submissionforms/digeex-galeria').flush(galeriaFixture);

    const populationType = result!.fields.find((f) => f.metadata === 'digeex.populationType');
    expect(populationType).toBeDefined();
    expect(populationType!.mandatory).toBe(false);
    expect(populationType!.mandatoryMessage).toBeUndefined();
  });

  it('should propagate the error when the endpoint returns 404', () => {
    let capturedError: { status: number } | undefined;
    service.getForm('inexistente').subscribe({
      next: () => {
        throw new Error('no debería emitir un valor para 404');
      },
      error: (err) => (capturedError = err),
    });

    httpMock
      .expectOne('/server/api/config/submissionforms/inexistente')
      .flush({ status: 404, error: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    expect(capturedError).toBeDefined();
    expect(capturedError!.status).toBe(404);
  });

  it('DIGEEX_FORM should export the names of the 3 DIGEEX forms', () => {
    expect(DIGEEX_FORM.DOCUMENTO).toBe('digeex-documento');
    expect(DIGEEX_FORM.GALERIA).toBe('digeex-galeria');
    expect(DIGEEX_FORM.ESTADISTICA).toBe('digeex-estadistica');
  });
});
