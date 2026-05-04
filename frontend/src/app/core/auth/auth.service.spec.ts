import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import Cookies from 'js-cookie';
import { AuthService } from './auth.service';
import { AuthStatus } from './models/auth-session.model';
import { environment } from '../../../environments/environment';

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

  const mockAdministratorGroup = {
    uuid: 'group-administrator',
    name: 'Administrator',
    permanent: true,
    type: 'group',
    _links: {
      self: { href: '/server/api/eperson/groups/group-administrator' },
      object: { href: '' },
      epersons: { href: '/server/api/eperson/groups/group-administrator/epersons' },
      subgroups: { href: '/server/api/eperson/groups/group-administrator/subgroups' },
    },
  };

  /**
   * EPerson base sin embed. Se usa en `setCurrentUserFromEPerson()` donde
   * el caller (por ejemplo el PATCH de identidad) no trae `_embedded.groups`.
   */
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

  /**
   * EPerson con grupos embebidos, la forma que devuelve DSpace cuando la
   * petición usa `?embed=groups`. Es lo que `login()` y `restoreSession()`
   * deben consumir para que el facade resuelva rol sin un roundtrip adicional.
   */
  const mockEPersonWithGroups = {
    ...mockEPerson,
    _embedded: {
      groups: {
        _embedded: { groups: [mockAdministratorGroup] },
        _links: { self: { href: '/server/api/eperson/epersons/eperson-001/groups' } },
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
      },
    },
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
    httpMock
      .expectOne('/server/api/eperson/epersons/eperson-001?embed=groups')
      .flush(mockEPersonWithGroups);

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
    Cookies.remove('dsAuthInfo', { path: '/' });
    Cookies.remove('dsAuthInfo');
    vi.restoreAllMocks();
  });

  /** Verifica que el servicio se instancie vía DI. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** Estado inicial */

  describe('initial state', () => {
    /** Verifica que los signals empiecen con isAuthenticated=false y currentUser=null. */
    it('should start with isAuthenticated false and currentUser null', () => {
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
    });

    /** Verifica que `currentEPerson` empiece en null antes de cualquier sesión. */
    it('should start with currentEPerson null', () => {
      expect(service.currentEPerson()).toBeNull();
    });
  });

  /** Login */

  describe('login()', () => {
    /** Verifica que login() mande POST a /authn/login con credenciales form-urlencoded. */
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

      const epersonReq = httpMock.expectOne(
        '/server/api/eperson/epersons/eperson-001?embed=groups',
      );
      expect(epersonReq.request.method).toBe('GET');
      epersonReq.flush(mockEPersonWithGroups);

      await promise;
    });

    /** Verifica que isAuthenticated pase a true tras un login exitoso. */
    it('should set isAuthenticated to true after successful login', async () => {
      expect(service.isAuthenticated()).toBe(false);

      await performLogin();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toBeTruthy();
      expect(service.currentUser()!.email).toBe('juan@mineduc.gob.gt');
    });

    /**
     * Verifica que tras login el signal `currentEPerson` quede con el
     * EPerson bruto incluyendo `_embedded.groups`, para que el facade de
     * usuarios resuelva el rol sin hacer un GET adicional.
     */
    it('should populate currentEPerson with embedded groups after login', async () => {
      await performLogin();

      const eperson = service.currentEPerson();
      expect(eperson).toBeTruthy();
      expect(eperson!.uuid).toBe('eperson-001');
      const embedded = eperson!._embedded?.groups?._embedded?.['groups'] ?? [];
      expect(embedded.map((g) => g.name)).toEqual(['Administrator']);
    });
  });

  /** Logout */

  describe('logout()', () => {
    /** Verifica que logout() mande POST a /authn/logout y deje los signals en cero. */
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
      expect(service.currentEPerson()).toBeNull();
    });
  });

  /** Refresh Token */

  describe('refreshToken()', () => {
    /** Verifica que refreshToken() mande POST sin body y con el Bearer actual. */
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
    /** Verifica que status() haga GET a /authn/status y devuelva el estado de sesión. */
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

  describe('JWT persistence in dsAuthInfo cookie', () => {
    /** Verifica que tras un login la cookie dsAuthInfo quede con accessToken y expires. */
    it('should write the dsAuthInfo cookie with AuthTokenInfo after a successful login', async () => {
      await performLogin();

      const raw = Cookies.get('dsAuthInfo');
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw!);
      expect(parsed.accessToken).toBe('fake-jwt-token-123');
      expect(typeof parsed.expires).toBe('number');
      expect(parsed.expires).toBeGreaterThan(Date.now());
    });

    /**
     * Verifica que getToken() lea el JWT de la cookie si la memoria está vacía.
     * Es el camino que usa la app al arrancar tras un reload del navegador.
     */
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

    /** Verifica que logout() borre la cookie dsAuthInfo. */
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

    /** Verifica que refreshToken() sobrescriba la cookie con el JWT renovado. */
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

    /**
     * Verifica que la cookie se grabe con path: '/', sameSite: 'lax' y secure
     * alineado al environment. El navegador descarta cookies `Secure` en HTTP
     * (dev), así que el flag solo se activa cuando environment.production.
     */
    it('should write dsAuthInfo with path, sameSite and secure flags tied to environment', async () => {
      const setSpy = vi.spyOn(Cookies, 'set');

      await performLogin();

      const call = setSpy.mock.calls.find(([name]) => name === 'dsAuthInfo');
      expect(call).toBeTruthy();
      const options = call![2] as { path?: string; sameSite?: string; secure?: boolean };
      expect(options.path).toBe('/');
      expect(options.sameSite).toBe('lax');
      expect(options.secure).toBe(environment.production);
    });

    /**
     * Verifica que logout() borre la cookie con path: '/'. js-cookie exige que
     * el path del remove coincida con el del set; sin esto la cookie
     * persistiría en navegadores estrictos.
     */
    it('should remove dsAuthInfo with path: "/" on logout', async () => {
      await performLogin();
      const removeSpy = vi.spyOn(Cookies, 'remove');

      const logoutPromise = new Promise<void>((resolve, reject) => {
        service.logout().subscribe({ next: () => resolve(), error: reject });
      });
      httpMock.expectOne('/server/api/authn/logout').flush(null, { status: 204, statusText: 'No Content' });
      await logoutPromise;

      const call = removeSpy.mock.calls.find(([name]) => name === 'dsAuthInfo');
      expect(call).toBeTruthy();
      expect(call![1]).toEqual({ path: '/' });
    });
  });

  /** Restore Session */

  describe('restoreSession()', () => {
    /**
     * Verifica que restoreSession() borre la cookie si el `expires` ya pasó.
     * Un JWT vencido del lado cliente no debe viajar como Bearer al arranque.
     */
    it('should remove the dsAuthInfo cookie when expires has passed', async () => {
      const expiredTokenInfo = {
        accessToken: 'stale-token',
        expires: Date.now() - 1000,
      };
      Cookies.set('dsAuthInfo', JSON.stringify(expiredTokenInfo));
      expect(Cookies.get('dsAuthInfo')).toBeTruthy();

      const promise = new Promise<void>((resolve, reject) => {
        service.restoreSession().subscribe({ next: () => resolve(), error: reject });
      });
      httpMock.expectOne('/server/api/authn/status').flush({ okay: true, authenticated: false });
      await promise;

      expect(Cookies.get('dsAuthInfo')).toBeUndefined();
    });

    /**
     * Verifica que restoreSession() borre la cookie cuando /authn/status responde 401.
     * DSpace devuelve 401 si el JWT ya no es válido (firma cambiada, sesión revocada).
     */
    it('should remove the dsAuthInfo cookie when /authn/status responds 401', async () => {
      const tokenRejectedByBackend = {
        accessToken: 'token-rejected-by-backend',
        expires: Date.now() + 60 * 60 * 1000,
      };
      Cookies.set('dsAuthInfo', JSON.stringify(tokenRejectedByBackend));

      const promise = new Promise<unknown>((resolve, reject) => {
        service.restoreSession().subscribe({ next: resolve, error: reject });
      });
      httpMock.expectOne('/server/api/authn/status').flush(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
      await promise;

      expect(Cookies.get('dsAuthInfo')).toBeUndefined();
    });

    /**
     * Verifica que restoreSession() borre la cookie cuando /authn/status responde 403.
     * Sucede si el JWT está vivo pero el usuario perdió los permisos para esta instancia.
     */
    it('should remove the dsAuthInfo cookie when /authn/status responds 403', async () => {
      const tokenRejectedByBackend = {
        accessToken: 'token-rejected-by-backend',
        expires: Date.now() + 60 * 60 * 1000,
      };
      Cookies.set('dsAuthInfo', JSON.stringify(tokenRejectedByBackend));

      const promise = new Promise<unknown>((resolve, reject) => {
        service.restoreSession().subscribe({ next: resolve, error: reject });
      });
      httpMock.expectOne('/server/api/authn/status').flush(null, {
        status: 403,
        statusText: 'Forbidden',
      });
      await promise;

      expect(Cookies.get('dsAuthInfo')).toBeUndefined();
    });
  });

  /**
   * Rehidrata `currentUser` con el EPerson devuelto por un PATCH de identidad,
   * reusando el mismo mapper de login() y restoreSession(). No-op sin sesión.
   */
  describe('setCurrentUserFromEPerson()', () => {
    /** Verifica que el signal tome firstName/lastName del metadata del EPerson recibido. */
    it('should update currentUser signal with firstName/lastName from EPerson metadata', async () => {
      await performLogin();
      expect(service.currentUser()!.firstName).toBe('Juan');
      expect(service.currentUser()!.lastName).toBe('Pérez');

      const updatedEPerson = {
        ...mockEPerson,
        metadata: {
          'eperson.firstname': [{ value: 'Juana', language: null, authority: null, confidence: -1, place: 0 }],
          'eperson.lastname': [{ value: 'Pérez García', language: null, authority: null, confidence: -1, place: 0 }],
        },
      };

      service.setCurrentUserFromEPerson(updatedEPerson);

      expect(service.currentUser()!.firstName).toBe('Juana');
      expect(service.currentUser()!.lastName).toBe('Pérez García');
      expect(service.currentUser()!.uuid).toBe('eperson-001');
      expect(service.currentUser()!.email).toBe('juan@mineduc.gob.gt');
    });

    /** Verifica que sin sesión activa el método sea no-op y no pueble el signal. */
    it('should be a no-op when currentUser is null', () => {
      expect(service.currentUser()).toBeNull();

      service.setCurrentUserFromEPerson(mockEPerson);

      expect(service.currentUser()).toBeNull();
      expect(service.currentEPerson()).toBeNull();
    });

    /**
     * El PATCH de identidad devuelve un EPerson sin `_embedded.groups`.
     * `currentEPerson` debe quedar con la identidad nueva del PATCH pero
     * preservando los grupos del snapshot previo: el rol no cambia por un
     * edit de nombre y no queremos invalidar el cache del facade.
     */
    it('should preserve embedded groups from the prior snapshot when patched EPerson lacks them', async () => {
      await performLogin();
      const priorGroups = service.currentEPerson()!._embedded?.groups;
      expect(priorGroups).toBeTruthy();

      const patched = {
        ...mockEPerson,
        metadata: {
          'eperson.firstname': [
            { value: 'Juana', language: null, authority: null, confidence: -1, place: 0 },
          ],
          'eperson.lastname': [
            { value: 'Pérez García', language: null, authority: null, confidence: -1, place: 0 },
          ],
        },
      };

      service.setCurrentUserFromEPerson(patched);

      const merged = service.currentEPerson()!;
      expect(merged.metadata['eperson.firstname'][0].value).toBe('Juana');
      expect(merged._embedded?.groups).toEqual(priorGroups);
    });
  });

  /**
   * storeRotatedToken persiste el JWT que el `jwtInterceptor` captura del
   * header `Authorization` en responses autenticadas. Es idempotente cuando
   * el token coincide con el actual para evitar reescribir la cookie en cada
   * response.
   */
  describe('storeRotatedToken()', () => {
    /** Verifica que un token distinto al actual se escriba en la cookie. */
    it('should write the new token to dsAuthInfo when it differs from the current one', async () => {
      await performLogin();
      expect(service.getToken()).toBe('fake-jwt-token-123');

      service.storeRotatedToken('rotated-token-abc');

      expect(service.getToken()).toBe('rotated-token-abc');
    });

    /** Verifica que un token idéntico al actual no gatille un set de cookie. */
    it('should be a no-op when the token equals the current one', async () => {
      await performLogin();
      const setSpy = vi.spyOn(Cookies, 'set');

      service.storeRotatedToken('fake-jwt-token-123');

      expect(setSpy).not.toHaveBeenCalled();
    });
  });
});
