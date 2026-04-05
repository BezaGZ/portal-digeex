import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BitstreamService } from './bitstream.service';

/**
 * Tests para BitstreamService.
 *
 * Servicio que encadena las peticiones bundles → bitstreams
 * de un item y genera URLs de descarga.
 *
 * Ciclo 2 TDD — Sprint 4 (RED).
 */
describe('BitstreamService', () => {
  let service: BitstreamService;
  let httpMock: HttpTestingController;

  const mockBundlesResponse = {
    _embedded: {
      bundles: [
        { uuid: 'bundle-thumb', name: 'THUMBNAIL', handle: '', type: 'bundle', _links: {} },
        { uuid: 'bundle-orig', name: 'ORIGINAL', handle: '', type: 'bundle', _links: {} },
      ],
    },
    _links: { self: { href: '' } },
    page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
  };

  const mockBitstreamsResponse = {
    _embedded: {
      bitstreams: [
        {
          uuid: 'bs-001',
          name: 'documento.pdf',
          handle: null,
          metadata: {},
          sizeBytes: 102400,
          checkSum: { checkSumAlgorithm: 'MD5', value: 'abc123' },
          sequenceId: 1,
          type: 'bitstream',
        },
      ],
    },
    _links: { self: { href: '' } },
    page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        BitstreamService,
      ],
    });

    service = TestBed.inject(BitstreamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get bitstreams from item bundles', async () => {
    const promise = new Promise((resolve, reject) => {
      service.getBitstreamsForItem('item-uuid-123').subscribe({
        next: (bitstreams) => {
          expect(bitstreams.length).toBe(1);
          expect(bitstreams[0].uuid).toBe('bs-001');
          expect(bitstreams[0].name).toBe('documento.pdf');
          resolve(bitstreams);
        },
        error: reject,
      });
    });

    /** Petición 1: bundles del item */ 
    const bundlesReq = httpMock.expectOne(
      (r) => r.url === '/server/api/core/items/item-uuid-123/bundles'
    );
    expect(bundlesReq.request.method).toBe('GET');
    bundlesReq.flush(mockBundlesResponse);

    /** Petición 2: bitstreams del bundle ORIGINAL */
    const bitstreamsReq = httpMock.expectOne(
      (r) => r.url === '/server/api/core/bundles/bundle-orig/bitstreams'
    );
    expect(bitstreamsReq.request.method).toBe('GET');
    bitstreamsReq.flush(mockBitstreamsResponse);

    await promise;
  });

  it('should build download URL', () => {
    const url = service.getDownloadUrl('bs-001');
    expect(url).toBe('/server/api/core/bitstreams/bs-001/content');
  });
});
