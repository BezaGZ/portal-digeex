import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import Cookies from 'js-cookie';
import { AuthService } from './auth.service';
import { AuthStatus } from './models/auth-session.model';

/**
 * Tests para AuthService.
 *
 * Servicio central de autenticación que consume los endpoints
 * /api/authn/login, /api/authn/status y /api/authn/logout de DSpace.
 * Expone signals reactivos `isAuthenticated` y `currentUser`.
 *
 * Ciclo 1 TDD — Sprint 5. Ajustado en Ciclo 14.
 */
describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  /** Fixtures */

  const mockAuthStatusAuthenticated: AuthStatus = {
    okay: true,
    authenticated: true,
    _links: {
      eperson: {
        href: 'http://localhost:8080/server/api/eperson/epersons/eperson-001',
      },
    },
  };

  const mockEPerson = {
    uuid: 'eperson-001',
    name: 'Juan Pérez',
    handle: null,
    metadata: {
      'eperson.firstname': [{ value: 'Juan', language: null, authority: null, confidence: -1, place: 0 }],
      'eperson.lastname': [{ value: 'Pérez', language: null, authority: null, confidence: -1, place: 0 }],
    },
    netid: null,
    lastActive: '2026-04-18',
    canLogIn: true,
    email: 'juan@mineduc.gob.gt',
    requireCertificate: false,
    selfRegistered: false,
    type: 'eperson',
  };

  /** Helpers */

  function performLogin(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      service.login('juan@mineduc.gob.gt', 'Password1').subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    httpMock.expectOne('/server/api/authn/login').flush(null, {
      headers: { Authorization: 'Bearer fake-jwt-token-123' },
    });
    httpMock.expectOne('/server/api/authn/status').flush(mockAuthStatusAuthenticated);
    httpMock.expectOne('/server/api/eperson/epersons/eperson-001').flush(mockEPerson);

    return promise;
  }

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    Cookies.remove('dsAuthInfo');
  });

  /** Verifica que el servicio se instancie correctamente. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** Estado inicial */

  describe('estado inicial', () => {
    /** Verifica que los signals empiecen con valores por defecto (no autenticado). */
    it('should start with isAuthenticated false and currentUser null', () => {
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
    });
  });

  /** Login */

  describe('login()', () => {
    /** Verifica que login() envíe POST a /api/authn/login con credenciales x-www-form-urlencoded. */
    it('should POST credentials to /api/authn/login', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.login('juan@mineduc.gob.gt', 'Password1').subscribe({
          next: () => resolve(),
          error: reject,
        });
      });

      const loginReq = httpMock.expectOne('/server/api/authn/login');
      expect(loginReq.request.method).toBe('POST');
      expect(loginReq.request.body).toBe('user=juan%40mineduc.gob.gt&password=Password1');
      expect(loginReq.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
      loginReq.flush(null, {
        headers: { Authorization: 'Bearer fake-jwt-token-123' },
      });

      const statusReq = httpMock.expectOne('/server/api/authn/status');
      expect(statusReq.request.method).toBe('GET');
      statusReq.flush(mockAuthStatusAuthenticated);

      const epersonReq = httpMock.expectOne('/server/api/eperson/epersons/eperson-001');
      expect(epersonReq.request.method).toBe('GET');
      epersonReq.flush(mockEPerson);

      await promise;
    });

    /** Verifica que login() actualice isAuthenticated a true tras un login exitoso. */
    it('should set isAuthenticated to true after successful login', async () => {
      expect(service.isAuthenticated()).toBe(false);

      await performLogin();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toBeTruthy();
      expect(service.currentUser()!.email).toBe('juan@mineduc.gob.gt');
    });
  });

  /** Logout */

  describe('logout()', () => {
    /** Verifica que logout() envíe POST a /api/authn/logout y limpie el estado. */
    it('should POST to /api/authn/logout and clear state', async () => {
      await performLogin();
      expect(service.isAuthenticated()).toBe(true);

      const logoutPromise = new Promise<void>((resolve, reject) => {
        service.logout().subscribe({
          next: () => resolve(),
          error: reject,
        });
      });

      const logoutReq = httpMock.expectOne('/server/api/authn/logout');
      expect(logoutReq.request.method).toBe('POST');
      logoutReq.flush(null, { status: 204, statusText: 'No Content' });

      await logoutPromise;

      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
    });
  });

  /** Refresh Token */

  describe('refreshToken()', () => {
    /** Verifica que refreshToken() envíe POST sin body y con Bearer token actual. */
    it('should POST to /api/authn/login with Bearer header and no body', async () => {
      await performLogin();

      const promise = new Promise<void>((resolve, reject) => {
        service.refreshToken().subscribe({
          next: () => resolve(),
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/authn/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-jwt-token-123');
      req.flush(null, {
        headers: { Authorization: 'Bearer new-refreshed-token-456' },
      });

      await promise;
      expect(service.getToken()).toBe('new-refreshed-token-456');
    });
  });

  /** Status */

  describe('status()', () => {
    /** Verifica que status() envíe GET a /api/authn/status y devuelva los datos del EPerson. */
    it('should GET /api/authn/status and return auth state', async () => {
      const promise = new Promise<AuthStatus>((resolve, reject) => {
        service.status().subscribe({
          next: (result) => resolve(result),
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/authn/status');
      expect(req.request.method).toBe('GET');
      req.flush(mockAuthStatusAuthenticated);

      const result = await promise;
      expect(result.authenticated).toBe(true);
      expect(result._links?.eperson?.href).toContain('eperson-001');
    });
  });

  /** Persistencia del JWT en cookie dsAuthInfo */

  describe('persistencia del JWT en cookie dsAuthInfo', () => {
    /** Verifica que tras un login exitoso, el JWT se escriba en la cookie dsAuthInfo
     *  con la forma { accessToken, expires } serializada en JSON. */
    it('should write the dsAuthInfo cookie with AuthTokenInfo after a successful login', async () => {
      await performLogin();

      const raw = Cookies.get('dsAuthInfo');
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw!);
      expect(parsed.accessToken).toBe('fake-jwt-token-123');
      expect(typeof parsed.expires).toBe('number');
      expect(parsed.expires).toBeGreaterThan(Date.now());
    });

    /** Verifica que getToken() devuelva el JWT leído de la cookie cuando el servicio
     *  no tiene el token en memoria (caso reload del navegador). */
    it('should read the JWT from the dsAuthInfo cookie when memory is empty', () => {
      const tokenInfo = {
        accessToken: 'persisted-jwt-from-cookie',
        expires: Date.now() + 24 * 60 * 60 * 1000,
      };
      Cookies.set('dsAuthInfo', JSON.stringify(tokenInfo));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          AuthService,
        ],
      });
      const freshService = TestBed.inject(AuthService);

      expect(freshService.getToken()).toBe('persisted-jwt-from-cookie');
    });

    /** Verifica que logout() elimine la cookie dsAuthInfo. */
    it('should remove the dsAuthInfo cookie on logout', async () => {
      await performLogin();
      expect(Cookies.get('dsAuthInfo')).toBeTruthy();

      const logoutPromise = new Promise<void>((resolve, reject) => {
        service.logout().subscribe({ next: () => resolve(), error: reject });
      });
      httpMock.expectOne('/server/api/authn/logout').flush(null, { status: 204, statusText: 'No Content' });
      await logoutPromise;

      expect(Cookies.get('dsAuthInfo')).toBeUndefined();
    });

    /** Verifica que refreshToken() actualice la cookie dsAuthInfo con el nuevo JWT. */
    it('should update the dsAuthInfo cookie when refreshToken succeeds', async () => {
      await performLogin();

      const refreshPromise = new Promise<void>((resolve, reject) => {
        service.refreshToken().subscribe({ next: () => resolve(), error: reject });
      });
      httpMock.expectOne('/server/api/authn/login').flush(null, {
        headers: { Authorization: 'Bearer new-refreshed-token-456' },
      });
      await refreshPromise;

      const raw = Cookies.get('dsAuthInfo');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.accessToken).toBe('new-refreshed-token-456');
    });
  });
});
