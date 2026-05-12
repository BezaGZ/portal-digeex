import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { BundleApiService } from './bundle-api.service';

/**
 * Tests de BundleApiService.
 *
 * Wrapper HTTP de los recursos de DSpace 9.x que el SubmissionFacade necesita
 * post-archive para colocar la portada manual del item en el bundle THUMBNAIL.
 * Confirmado contra:
 *  - RestContract/items.md sección Bundles (POST a /api/core/items/{uuid}/bundles
 *    con JSON {name, metadata: {}}).
 *  - RestContract/bundles.md sección Bitstreams (POST multipart con field `file`
 *    al endpoint /api/core/bundles/{uuid}/bitstreams).
 *
 * Ciclo 23 TDD - Sprint 6.
 */
describe('BundleApiService', () => {
  let service: BundleApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), BundleApiService],
    });
    service = TestBed.inject(BundleApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Verifica que createBundle envíe POST con name y metadata vacía al endpoint de bundles del item. */
  it('should POST to /api/core/items/{uuid}/bundles with name and empty metadata', () => {
    let result: { uuid: string; name: string } | undefined;
    service
      .createBundle('item-uuid-123', 'THUMBNAIL')
      .subscribe((b) => (result = b as { uuid: string; name: string }));

    const req = httpMock.expectOne('/server/api/core/items/item-uuid-123/bundles');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'THUMBNAIL', metadata: {} });
    req.flush({ uuid: 'bundle-uuid-1', name: 'THUMBNAIL', type: 'bundle' });

    expect(result?.uuid).toBe('bundle-uuid-1');
    expect(result?.name).toBe('THUMBNAIL');
  });

  /** Verifica que listBitstreams haga GET al endpoint de bitstreams del bundle. */
  it('should GET /api/core/bundles/{uuid}/bitstreams and return the embedded list', () => {
    let result: { uuid: string }[] | undefined;
    service
      .listBitstreams('bundle-uuid-1')
      .subscribe((b) => (result = b as { uuid: string }[]));

    const req = httpMock.expectOne('/server/api/core/bundles/bundle-uuid-1/bitstreams');
    expect(req.request.method).toBe('GET');
    req.flush({
      _embedded: {
        bitstreams: [
          { uuid: 'bs-a', name: 'a.jpg', type: 'bitstream' },
          { uuid: 'bs-b', name: 'b.jpg', type: 'bitstream' },
        ],
      },
    });

    expect(result?.map((b) => b.uuid)).toEqual(['bs-a', 'bs-b']);
  });

  /** Verifica que deleteBitstream haga DELETE al recurso bitstream por uuid. */
  it('should DELETE /api/core/bitstreams/{uuid}', () => {
    let completed = false;
    service.deleteBitstream('bs-a').subscribe(() => (completed = true));

    const req = httpMock.expectOne('/server/api/core/bitstreams/bs-a');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBe(true);
  });

  /** Verifica que uploadBitstream envíe FormData multipart con campo "file" al bundle indicado. */
  it('should POST a multipart bitstream to /api/core/bundles/{uuid}/bitstreams with field "file"', () => {
    const file = new File(['contenido'], 'portada.jpg', { type: 'image/jpeg' });
    let result: { uuid: string } | undefined;
    service
      .uploadBitstream('bundle-uuid-1', file)
      .subscribe((b) => (result = b as { uuid: string }));

    const req = httpMock.expectOne('/server/api/core/bundles/bundle-uuid-1/bitstreams');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body instanceof FormData).toBe(true);
    expect((body.get('file') as File).name).toBe('portada.jpg');
    req.flush({ uuid: 'bitstream-uuid-1', name: 'portada.jpg', type: 'bitstream' });

    expect(result?.uuid).toBe('bitstream-uuid-1');
  });
});
