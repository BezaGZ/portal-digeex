/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import {
  LoginComponent,
  LOGIN_MISSING_ROLE_MESSAGE,
  LOGIN_INVALID_CREDENTIALS_MESSAGE,
  LOGIN_SERVICE_UNAVAILABLE_MESSAGE,
  LOGIN_SESSION_EXPIRED_MESSAGE,
} from './login';
import { AuthService } from '../../../core/auth/auth.service';
import { HardRedirectService } from '../../../core/navigation/hard-redirect.service';

/**
 * Tests de `LoginComponent`. Conecta el formulario con `AuthService` y, tras un
 * login exitoso, navega a `/administrador` (o a la ruta pretendida vía
 * `?returnUrl=`). El caso sin rol no se decide acá: `rolePresenceGuard` lo
 * corta en la entrada al panel con la misma UX (`?error=sin-rol`, cuyo mensaje
 * este componente restaura al recargar, como dspace con `?expired=true`).
 *
 * Ciclo 4 TDD — Sprint 5. Ajustado en Ciclo 13, Ciclo 43 (Sprint 8), 2026-06-21
 * (mejora 5), Ciclos 22, 41 y 49 (Sprint 10), y Ciclo 6 (Sprint 11: el login
 * deja el snapshot síncrono; el huérfano lo resuelve el guard).
 */
describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let router: Router;
  let httpMock: HttpTestingController;
  let redirectFn: ReturnType<typeof vi.fn>;

  /** Setup */

  beforeEach(async () => {
    redirectFn = vi.fn();

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
        { provide: HardRedirectService, useValue: { redirect: redirectFn } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
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
    /** Tras autenticar, el componente navega directo al panel; el rol lo valida el guard. */
    it('should navigate to /administrador after a successful login', async () => {
      component.email.set('juan@mineduc.gob.gt');
      component.password.set('Password1');

      component.onLogin();

      flushSuccessfulAuth();

      await fixture.whenStable();

      expect(router.navigate).toHaveBeenCalledWith(['/administrador']);
      expect(component.errorMessage()).toBe('');
    });

    /** Con `?returnUrl=` interno presente, el login navega a esa ruta en vez del panel. */
    it('should navigate to the internal returnUrl after a successful login', async () => {
      const route = TestBed.inject(ActivatedRoute);
      vi.spyOn(route.snapshot.queryParamMap, 'get').mockImplementation(
        (key: string) => (key === 'returnUrl' ? '/administrador/envios/abc' : null),
      );
      const byUrlSpy = vi.spyOn(router, 'navigateByUrl');

      component.email.set('juan@mineduc.gob.gt');
      component.password.set('Password1');
      component.onLogin();
      flushSuccessfulAuth();
      await fixture.whenStable();

      expect(byUrlSpy).toHaveBeenCalledWith('/administrador/envios/abc');
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

/**
 * Al cargar el login con `?expired=true` (tras la recarga dura por sesión vencida),
 * el componente muestra el mensaje de sesión expirada desde el query param.
 */
describe('LoginComponent mensaje por sesión vencida', () => {
  it('should show the session-expired message when loaded with ?expired=true', () => {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
        { provide: HardRedirectService, useValue: { redirect: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ expired: 'true' }) } },
        },
      ],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.errorMessage()).toBe(LOGIN_SESSION_EXPIRED_MESSAGE);
  });
});
