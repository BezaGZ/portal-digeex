import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { WorkspaceItemApiService } from './workspaceitem-api.service';
import workspaceitemCreateFixture from './test-fixtures/submission-workspaceitem-create-response.json';
import workspaceitemPatchFixture from './test-fixtures/submission-workspaceitem-patch-response.json';
import workspaceitemUploadFixture from './test-fixtures/submission-workspaceitem-upload-response.json';
import { JsonPatchEntry } from './json-patch.util';

/**
 * Tests de WorkspaceItemApiService.
 *
 * Wrapper del recurso /api/submission/workspaceitems de DSpace 9.x.
 * Cubre el ciclo de vida del workspaceitem durante la submission: crear
 * sobre una collection, parchar secciones de metadata y license, subir
 * archivos como bitstreams, commitear al workflow para archivar, y
 * borrar si la submission se cancela.
 *
 * Ciclo 14 TDD — Sprint 6
 */
describe('WorkspaceItemApiService', () => {
  let service: WorkspaceItemApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkspaceItemApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(WorkspaceItemApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('create()', () => {
    it('should POST to /api/submission/workspaceitems with owningCollection in query and empty body', () => {
      let received: typeof workspaceitemCreateFixture | undefined;

      service.create('coll-uuid').subscribe((ws) => (received = ws));

      const req = httpMock.expectOne(
        '/server/api/submission/workspaceitems?owningCollection=coll-uuid',
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(workspaceitemCreateFixture);

      expect(received?.id).toBe(workspaceitemCreateFixture.id);
      expect(received?.type).toBe('workspaceitem');
    });
  });

  describe('patchSection()', () => {
    it('should PATCH /api/submission/workspaceitems/{id} with the JsonPatchEntry array and return the updated workspaceitem', () => {
      const patch: JsonPatchEntry[] = [
        {
          op: 'add',
          path: '/sections/traditionalpageone/dc.title',
          value: [{ value: 'Nuevo título' }],
        },
      ];
      let received: typeof workspaceitemPatchFixture | undefined;

      service.patchSection(57, patch).subscribe((ws) => (received = ws));

      const req = httpMock.expectOne('/server/api/submission/workspaceitems/57');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(patch);
      req.flush(workspaceitemPatchFixture);

      expect(received?.id).toBe(workspaceitemPatchFixture.id);
    });
  });

  describe('uploadFile()', () => {
    it('should POST multipart with field "file" to the workspaceitem endpoint and return the workspaceitem with the file in /sections/upload/files', () => {
      const file = new File(['dummy'], 'captura.pdf', { type: 'application/pdf' });
      let received: typeof workspaceitemUploadFixture | undefined;

      service.uploadFile(57, file).subscribe((ws) => (received = ws));

      const req = httpMock.expectOne('/server/api/submission/workspaceitems/57');
      expect(req.request.method).toBe('POST');
      const body = req.request.body as FormData;
      expect(body instanceof FormData).toBe(true);
      expect(body.get('file')).toBe(file);
      req.flush(workspaceitemUploadFixture);

      // El upload retorna el workspaceitem con sections.upload.files poblado.
      const files = (received as { sections?: { upload?: { files?: unknown[] } } })
        ?.sections?.upload?.files;
      expect(files?.length).toBeGreaterThan(0);
    });
  });

  describe('commit()', () => {
    it('should POST text/uri-list with the workspaceitem URI to /api/workflow/workflowitems and complete with void at empty body', () => {
      let nextEmitted = false;
      let completed = false;

      service.commit(57).subscribe({
        next: () => (nextEmitted = true),
        complete: () => (completed = true),
      });

      const req = httpMock.expectOne('/server/api/workflow/workflowitems');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Content-Type')).toBe('text/uri-list');
      expect(req.request.body).toContain('/api/submission/workspaceitems/57');
      req.flush(null, { status: 201, statusText: 'Created' });

      expect(nextEmitted).toBe(true);
      expect(completed).toBe(true);
    });
  });

  describe('getItem()', () => {
    it('should GET /api/submission/workspaceitems/{id}/item and return the in-progress item', () => {
      const itemFixture = { uuid: 'item-uuid', name: 'En progreso', type: 'item' };
      let received: typeof itemFixture | undefined;

      service.getItem(57).subscribe((item) => (received = item as typeof itemFixture));

      const req = httpMock.expectOne('/server/api/submission/workspaceitems/57/item');
      expect(req.request.method).toBe('GET');
      req.flush(itemFixture);

      expect(received?.uuid).toBe('item-uuid');
    });
  });

  describe('delete()', () => {
    it('should DELETE /api/submission/workspaceitems/{id} and complete with void at 204', () => {
      let nextEmitted = false;
      let completed = false;

      service.delete(57).subscribe({
        next: () => (nextEmitted = true),
        complete: () => (completed = true),
      });

      const req = httpMock.expectOne('/server/api/submission/workspaceitems/57');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(nextEmitted).toBe(true);
      expect(completed).toBe(true);
    });
  });
});
