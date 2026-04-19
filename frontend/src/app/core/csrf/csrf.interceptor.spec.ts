import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { csrfInterceptor } from './csrf.interceptor';

/**
 * Tests para csrfInterceptor.
 *
 * Interceptor HTTP que implementa el flujo CSRF de DSpace 9.2:
 * - withCredentials: true en todas las peticiones
 * - Lee token de cookie client-side XSRF-TOKEN
 * - Envía X-XSRF-TOKEN en operaciones mutantes
 * - Extrae DSPACE-XSRF-TOKEN de respuestas (éxito y error)
 * - Guarda el token actualizado en cookie XSRF-TOKEN
 *
 * Ciclo 2 TDD — Sprint 3
 */
describe('csrfInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting()
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
    document.cookie = 'DSPACE-XSRF-COOKIE=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  /** withCredentials */

  /** Verifica que todas las peticiones incluyan withCredentials: true. */
  it('should set withCredentials: true on all requests', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});

    await promise;
  });

  /** POST Requests */

  /** Verifica que el interceptor adjunte X-XSRF-TOKEN en requests POST. */
  it('should attach X-XSRF-TOKEN on POST requests', async () => {
    document.cookie = 'XSRF-TOKEN=test-token-123; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-123');
    req.flush({});

    await promise;
  });

  /** PUT Requests */

  /** Verifica que el interceptor adjunte X-XSRF-TOKEN en requests PUT. */
  it('should attach X-XSRF-TOKEN on PUT requests', async () => {
    document.cookie = 'XSRF-TOKEN=test-token-456; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.put('/server/api/test', {}).subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-456');
    req.flush({});

    await promise;
  });

  /** PATCH Requests */

  /** Verifica que el interceptor adjunte X-XSRF-TOKEN en requests PATCH. */
  it('should attach X-XSRF-TOKEN on PATCH requests', async () => {
    document.cookie = 'XSRF-TOKEN=test-token-789; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.patch('/server/api/test', {}).subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-789');
    req.flush({});

    await promise;
  });

  /** DELETE Requests */

  /** Verifica que el interceptor adjunte X-XSRF-TOKEN en requests DELETE. */
  it('should attach X-XSRF-TOKEN on DELETE requests', async () => {
    document.cookie = 'XSRF-TOKEN=test-token-delete; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.delete('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-delete');
    req.flush({});

    await promise;
  });

  /** GET Requests (sin token) */

  /** Verifica que el interceptor NO adjunte el header en requests GET. */
  it('should NOT attach token on GET requests', async () => {
    document.cookie = 'XSRF-TOKEN=should-not-be-attached; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    req.flush({});

    await promise;
  });

  /** Fallback a DSPACE-XSRF-COOKIE */

  /** Verifica que use DSPACE-XSRF-COOKIE como fallback si XSRF-TOKEN no existe. */
  it('should fallback to DSPACE-XSRF-COOKIE if XSRF-TOKEN cookie is missing', async () => {
    document.cookie = 'DSPACE-XSRF-COOKIE=fallback-token; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('fallback-token');
    req.flush({});

    await promise;
  });

  /** Extracción de token desde respuestas exitosas */

  /** Verifica que extraiga el token del header DSPACE-XSRF-TOKEN en respuestas exitosas. */
  it('should save XSRF token from successful response header', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush({}, { headers: { 'DSPACE-XSRF-TOKEN': 'new-token-from-response' } });

    await promise;

    expect(document.cookie).toContain('XSRF-TOKEN=new-token-from-response');
  });

  /** Extracción de token desde respuestas con error */

  /** Verifica que extraiga el token del header DSPACE-XSRF-TOKEN incluso en errores. */
  it('should save XSRF token from error response header', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({ next: resolve, error: () => reject() });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush(null, {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'DSPACE-XSRF-TOKEN': 'fresh-token-after-403' },
    });

    await promise.catch(() => {});

    expect(document.cookie).toContain('XSRF-TOKEN=fresh-token-after-403');
  });
});
