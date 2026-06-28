import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, withNoXsrfProtection, HttpClient } from '@angular/common/http';
import { xsrfInterceptor } from './xsrf.interceptor';
import Cookies from 'js-cookie';
import { vi } from 'vitest';

/**
 * Tests de `xsrfInterceptor`.
 *
 * Cubren que el token CSRF viaje en las operaciones que modifican datos y no en
 * las lecturas, que se guarde el token nuevo que llega en la respuesta, y que
 * toda peticion use credenciales. Siguen el flujo de dspace-angular y el contrato
 * de DSpace 9.2, con el XSRF nativo de Angular apagado.
 *
 * Ciclo 43 TDD — Sprint 8. Ajustado en el Ciclo 37 (Sprint 10).
 */
describe('xsrfInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;

  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([xsrfInterceptor]), withNoXsrfProtection()),
        provideHttpClientTesting(),
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  /** Verifica que todas las peticiones incluyan withCredentials: true. */
  it('should change withCredentials to true at all times', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});

    await promise;
  });

  /** Verifica que adjunte X-XSRF-TOKEN (leido de la cookie) en un POST al REST. */
  it('should add X-XSRF-TOKEN header on a modifying (POST) request to the REST API', async () => {
    document.cookie = 'XSRF-TOKEN=test-token-123; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-token-123');
    req.flush({});

    await promise;
  });

  /** Verifica que NO adjunte el token en un GET (no modificante). */
  it('should NOT add X-XSRF-TOKEN header on a GET request', async () => {
    document.cookie = 'XSRF-TOKEN=test-token-123; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    req.flush({});

    await promise;
  });

  /** Verifica que NO adjunte el token en una mutacion a una URL ajena al REST. */
  it('should NOT add X-XSRF-TOKEN header on a request to an untrusted URL', async () => {
    document.cookie = 'XSRF-TOKEN=test-token-123; path=/';

    const promise = new Promise((resolve, reject) => {
      httpClient.post('https://untrusted.com', {}).subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('https://untrusted.com');
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    req.flush({});

    await promise;
  });

  /** Verifica que guarde el token de DSPACE-XSRF-TOKEN en una respuesta exitosa. */
  it('should save the XSRF-TOKEN cookie when DSPACE-XSRF-TOKEN header is found in a response', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush({}, { headers: { 'DSPACE-XSRF-TOKEN': 'new-token-from-response' } });

    await promise;

    expect(document.cookie).toContain('XSRF-TOKEN=new-token-from-response');
  });

  /** Verifica que tambien guarde el token cuando llega en una respuesta de error. */
  it('should save the XSRF-TOKEN cookie when DSPACE-XSRF-TOKEN header is found in an error response', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.post('/server/api/test', {}).subscribe({ next: resolve, error: () => reject() });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush(null, {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'DSPACE-XSRF-TOKEN': 'fresh-token-after-error' },
    });

    await promise.catch(() => {});

    expect(document.cookie).toContain('XSRF-TOKEN=fresh-token-after-error');
  });

  /** Verifica que la cookie XSRF se setee con sameSite y secure (alineada con la cookie de auth). */
  it('should set the XSRF-TOKEN cookie with sameSite and secure flags', async () => {
    const setSpy = vi.spyOn(Cookies, 'set');

    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({ next: resolve, error: reject });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush({}, { headers: { 'DSPACE-XSRF-TOKEN': 'tok-flags' } });
    await promise;

    const call = setSpy.mock.calls.find(([name]) => name === 'XSRF-TOKEN');
    expect(call).toBeDefined();
    expect(call![2]).toMatchObject({ path: '/', sameSite: 'lax' });
    expect(call![2]).toHaveProperty('secure');

    setSpy.mockRestore();
  });
});
