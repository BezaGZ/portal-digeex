import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { csrfInterceptor, resetCsrfToken } from './csrf.interceptor';

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
    /** Token en memoria del módulo entre tests: aislar para que un
     *  test que rota el token no dispare el retry del siguiente. */
    resetCsrfToken();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
    document.cookie = 'DSPACE-XSRF-COOKIE=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';

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
    resetCsrfToken();
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

  /**
   * Verifica que el token nuevo del header DSPACE-XSRF-TOKEN se guarde
   * también cuando llega en una respuesta de error, no solo en éxito.
   * Se usa un 401 para aislar la extracción del retry específico de 403.
   */
  it('should save XSRF token from error response header', async () => {
    document.cookie = 'XSRF-TOKEN=stale-token; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({ next: resolve, error: () => reject() });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush(null, {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'DSPACE-XSRF-TOKEN': 'fresh-token-after-error' },
    });

    await promise.catch(() => {});

    expect(document.cookie).toContain('XSRF-TOKEN=fresh-token-after-error');
  });

  /** Reintento automático en 403 con token rotado */

  /**
   * Verifica que si DSpace responde 403 con un token nuevo en el header
   * DSPACE-XSRF-TOKEN, el interceptor reintente la petición original con
   * ese token rotado y entregue la respuesta exitosa del reintento.
   */
  it('should retry the original mutating request once with the rotated token on 403', async () => {
    document.cookie = 'XSRF-TOKEN=stale-token; path=/';

    const result: { value?: unknown } = {};
    const promise = new Promise<void>((resolve, reject) => {
      httpClient.post('/server/api/test', { payload: 1 }).subscribe({
        next: (v) => {
          result.value = v;
          resolve();
        },
        error: reject,
      });
    });

    const first = httpMock.expectOne('/server/api/test');
    expect(first.request.headers.get('X-XSRF-TOKEN')).toBe('stale-token');
    first.flush(null, {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'DSPACE-XSRF-TOKEN': 'rotated-token' },
    });

    const retry = httpMock.expectOne('/server/api/test');
    expect(retry.request.headers.get('X-XSRF-TOKEN')).toBe('rotated-token');
    expect(retry.request.body).toEqual({ payload: 1 });
    retry.flush({ ok: true });

    await promise;

    expect(result.value).toEqual({ ok: true });
  });

  /**
   * Verifica que un 403 sin token rotado (mismo token o header ausente)
   * no dispare reintento y el error se propague al suscriptor.
   */
  it('should not retry on 403 when no rotated token is present in the response', async () => {
    document.cookie = 'XSRF-TOKEN=same-token; path=/';

    let capturedStatus: number | null = null;
    const promise = new Promise<void>((resolve) => {
      httpClient.post('/server/api/test', {}).subscribe({
        next: () => resolve(),
        error: (err) => {
          capturedStatus = err.status;
          resolve();
        },
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush(null, { status: 403, statusText: 'Forbidden' });

    await promise;
    httpMock.expectNone('/server/api/test');
    expect(capturedStatus).toBe(403);
  });
});
