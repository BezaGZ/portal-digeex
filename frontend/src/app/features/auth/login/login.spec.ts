/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject, of } from 'rxjs';
import {
  LoginComponent,
  LOGIN_MISSING_ROLE_MESSAGE,
  LOGIN_INVALID_CREDENTIALS_MESSAGE,
  LOGIN_SERVICE_UNAVAILABLE_MESSAGE,
} from './login';
import { AuthService } from '../../../core/auth/auth.service';
import { HardRedirectService } from '../../../core/navigation/hard-redirect.service';
import { CallerProvider } from '../../../core/auth/caller-provider';
import { Caller } from '../../../core/auth/caller.model';

/**
 * Tests de `LoginComponent`. Conecta el formulario con `AuthService` y, tras un login exitoso,
 * lee `CallerProvider.currentCallerSnapshot()` (contrato de core) para resolver el rol del eperson
 * autenticado. Si el rol es válido navega a `/administrador`; si el snapshot no tiene rol cierra la
 * sesión y hace una recarga dura al login con `?error=sin-rol` (la recarga resincroniza
 * el CSRF; el query param restaura el mensaje, como dspace con `?expired=true`).
 *
 * Ciclo 4 TDD — Sprint 5. Ajustado en Ciclo 13, Ciclo 43 (Sprint 8), 2026-06-21
 * (mejora 5: depende de CallerProvider de core, no de UserManagementService) y
 * Ciclo 22 (Sprint 10: snapshot síncrono en vez de firstValueFrom).
 */
describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: AuthService;
  let router: Router;
  let httpMock: HttpTestingController;
  let currentCaller$: BehaviorSubject<Caller | null>;
  let callerSnapshot: Caller | null;
  let redirectFn: ReturnType<typeof vi.fn>;

  /** Setup */

  beforeEach(async () => {
    currentCaller$ = new BehaviorSubject<Caller | null>(null);
    callerSnapshot = null;
    redirectFn = vi.fn();

    const callerProviderStub = {
      currentCaller$: currentCaller$.asObservable(),
      currentActor$: of(null),
      currentCallerSnapshot: () => callerSnapshot,
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'administrador', component: {} as any },
          { path: 'iniciar-sesion', component: LoginComponent },
        ]),
        AuthService,
        { provide: CallerProvider, useValue: callerProviderStub },
        { provide: HardRedirectService, useValue: { redirect: redirectFn } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);

    vi.spyOn(router, 'navigate');
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Resuelve la cadena HTTP de `AuthService.login()` para dejar al componente justo después de `currentUser`. */
  function flushSuccessfulAuth(): void {
    const loginReq = httpMock.expectOne('/server/api/authn/login');
    loginReq.flush(null, {
      headers: { Authorization: 'Bearer fake-jwt-token' },
    });

    const statusReq = httpMock.expectOne('/server/api/authn/status');
    statusReq.flush({
      okay: true,
      authenticated: true,
      _links: {
        eperson: {
          href: 'http://localhost:8080/server/api/eperson/epersons/eperson-001',
        },
      },
    });

    const epersonReq = httpMock.expectOne(
      '/server/api/eperson/epersons/eperson-001?embed=groups',
    );
    epersonReq.flush({
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
      _embedded: {
        groups: {
          _embedded: { groups: [] },
          _links: { self: { href: '/server/api/eperson/epersons/eperson-001/groups' } },
          page: { size: 20, totalElements: 0, totalPages: 0, number: 0 },
        },
      },
    });
  }

  /** Verifica que el componente se cree correctamente. */
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('login exitoso', () => {
    /** Con rol resuelto válido (`superadmin`), el componente navega a `/administrador`. */
    it('should navigate to /administrador when the resolved role is superadmin', async () => {
      callerSnapshot = { role: 'superadmin', sufijo: null };

      component.email.set('juan@mineduc.gob.gt');
      component.password.set('Password1');

      component.onLogin();

      flushSuccessfulAuth();

      await fixture.whenStable();

      expect(router.navigate).toHaveBeenCalledWith(['/administrador']);
      expect(component.errorMessage()).toBe('');
    });
  });

  describe('login fallido', () => {
    /**
     * El 401 de DSpace es deliberadamente genérico (credenciales malas, cuenta
     * desactivada o sin activar se ven iguales); el mensaje cubre los tres casos.
     */
    it('should show the credentials message on 401', async () => {
      component.email.set('juan@mineduc.gob.gt');
      component.password.set('wrong-password');

      component.onLogin();

      const loginReq = httpMock.expectOne('/server/api/authn/login');
      loginReq.flush(null, { status: 401, statusText: 'Unauthorized' });

      await fixture.whenStable();

      expect(component.errorMessage()).toBe(LOGIN_INVALID_CREDENTIALS_MESSAGE);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    /** Un 5xx no es un problema de credenciales: el mensaje debe decir que el servicio falló. */
    it('should show the service unavailable message on 5xx', async () => {
      component.email.set('juan@mineduc.gob.gt');
      component.password.set('secret');

      component.onLogin();

      const loginReq = httpMock.expectOne('/server/api/authn/login');
      loginReq.flush(null, { status: 503, statusText: 'Service Unavailable' });

      await fixture.whenStable();

      expect(component.errorMessage()).toBe(LOGIN_SERVICE_UNAVAILABLE_MESSAGE);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    /** Un error de red (status 0, DSpace inalcanzable) tampoco es culpa de las credenciales. */
    it('should show the service unavailable message on network error', async () => {
      component.email.set('juan@mineduc.gob.gt');
      component.password.set('secret');

      component.onLogin();

      const loginReq = httpMock.expectOne('/server/api/authn/login');
      loginReq.error(new ProgressEvent('error'));

      await fixture.whenStable();

      expect(component.errorMessage()).toBe(LOGIN_SERVICE_UNAVAILABLE_MESSAGE);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('role resolution failure', () => {
    /**
     * Si la autenticación pasa pero el snapshot del caller es null (sin rol), el componente
     * cierra sesión y hace recarga dura al login con `?error=sin-rol`. No navega al panel.
     */
    it('should logout and hard-redirect to login with ?error=sin-rol when the snapshot has no role', async () => {
      callerSnapshot = null;

      const logoutSpy = vi.spyOn(authService, 'logout').mockReturnValue(of(null));

      component.email.set('juan@mineduc.gob.gt');
      component.password.set('Password1');

      component.onLogin();

      flushSuccessfulAuth();

      await fixture.whenStable();

      expect(logoutSpy).toHaveBeenCalled();
      expect(redirectFn).toHaveBeenCalledWith('/iniciar-sesion?error=sin-rol');
      expect(router.navigate).not.toHaveBeenCalledWith(['/administrador']);
    });
  });
});

/**
 * Al cargar el login con `?error=sin-rol` (tras la recarga dura del caso sin rol),
 * el componente restaura el mensaje "sin rol" desde el query param.
 */
describe('LoginComponent mensaje por query param', () => {
  it('should show the missing-role message when loaded with ?error=sin-rol', () => {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
        { provide: CallerProvider, useValue: { currentCaller$: of(null), currentActor$: of(null), currentCallerSnapshot: () => null } },
        { provide: HardRedirectService, useValue: { redirect: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ error: 'sin-rol' }) } },
        },
      ],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.errorMessage()).toBe(LOGIN_MISSING_ROLE_MESSAGE);
  });
});
