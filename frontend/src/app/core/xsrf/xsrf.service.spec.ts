import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { XsrfService } from './xsrf.service';

/**
 * Tests de `XsrfService`.
 *
 * Cubren que la app pida el primer token CSRF al arrancar y marque que ya esta
 * listo. Equivale al servicio de arranque de dspace-angular, sin la parte de SSR.
 *
 * Ciclo 43 TDD — Sprint 8
 */
describe('XsrfService', () => {
  let service: XsrfService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(XsrfService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Verifica que pida el token a /security/csrf y conmute tokenInitialized$. */
  it('initXSRFToken should call GET /security/csrf and set tokenInitialized$ to true', async () => {
    expect(service.tokenInitialized$.value).toBe(false);

    await service.initXSRFToken();

    const req = httpMock.expectOne('/server/api/security/csrf');
    expect(req.request.method).toBe('GET');
    req.flush(null);

    expect(service.tokenInitialized$.value).toBe(true);
  });
});
