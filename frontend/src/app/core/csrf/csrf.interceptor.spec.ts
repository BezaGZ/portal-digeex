import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { csrfInterceptor } from './csrf.interceptor';

/**
 * Tests para csrfInterceptor.
 *
 * Interceptor HTTP que protege contra ataques CSRF (Cross-Site Request Forgery).
 * Lee el token desde la cookie DSPACE-XSRF-COOKIE y lo adjunta como header
 * X-XSRF-TOKEN en operaciones mutantes (POST, PUT, PATCH, DELETE).
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
    document.cookie = 'DSPACE-XSRF-COOKIE=; expires=Thu, 01 Jan 1970 00:00:00 UTC';
  });

  /** POST Requests */

  /** Verifica que el interceptor adjunte el header X-XSRF-TOKEN en requests POST. */
  it('should attach X-XSRF-TOKEN on POST requests', async () => {
    document.cookie = 'DSPACE-XSRF-COOKIE=test-token-123';

    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({
        next: resolve,
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-123');
    req.flush({});

    await promise;
  });

  /** PUT Requests */

  /** Verifica que el interceptor adjunte el header X-XSRF-TOKEN en requests PUT. */
  it('should attach X-XSRF-TOKEN on PUT requests', async () => {
    document.cookie = 'DSPACE-XSRF-COOKIE=test-token-456';

    const promise = new Promise((resolve, reject) => {
      httpClient.put('/server/api/test', {}).subscribe({
        next: resolve,
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-456');
    req.flush({});

    await promise;
  });

  /** PATCH Requests */

  /** Verifica que el interceptor adjunte el header X-XSRF-TOKEN en requests PATCH. */
  it('should attach X-XSRF-TOKEN on PATCH requests', async () => {
    document.cookie = 'DSPACE-XSRF-COOKIE=test-token-789';

    const promise = new Promise((resolve, reject) => {
      httpClient.patch('/server/api/test', {}).subscribe({
        next: resolve,
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-789');
    req.flush({});

    await promise;
  });

  /** DELETE Requests */

  /** Verifica que el interceptor adjunte el header X-XSRF-TOKEN en requests DELETE. */
  it('should attach X-XSRF-TOKEN on DELETE requests', async () => {
    document.cookie = 'DSPACE-XSRF-COOKIE=test-token-delete';

    const promise = new Promise((resolve, reject) => {
      httpClient.delete('/server/api/test').subscribe({
        next: resolve,
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-delete');
    req.flush({});

    await promise;
  });

  /** GET Requests (sin token) */

  /** Verifica que el interceptor NO adjunte el header en requests GET (solo lectura). */
  it('should NOT attach token on GET requests', async () => {
    document.cookie = 'DSPACE-XSRF-COOKIE=should-not-be-attached';

    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({
        next: resolve,
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    req.flush({});

    await promise;
  });

  /** Cookie Reading */

  /** Verifica que el interceptor lea correctamente el token desde la cookie DSPACE-XSRF-COOKIE. */
  it('should read token from DSPACE-XSRF-COOKIE', async () => {
    const testToken = 'secure-csrf-token-xyz';
    document.cookie = `DSPACE-XSRF-COOKIE=${testToken}`;

    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({
        next: resolve,
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    const attachedToken = req.request.headers.get('X-XSRF-TOKEN');
    expect(attachedToken).toBe(testToken);
    req.flush({});

    await promise;
  });
});
