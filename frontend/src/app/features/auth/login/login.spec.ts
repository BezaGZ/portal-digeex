/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { LoginComponent } from './login';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Tests para LoginComponent.
 *
 * Componente que conecta el formulario de login con AuthService.
 * Login exitoso redirige a /administrador/estadisticas.
 * Login fallido muestra mensaje de error.
 *
 * Ciclo 4 TDD — Sprint 5
 */
describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let _authService: AuthService;
  let router: Router;
  let httpMock: HttpTestingController;

  /** Setup */

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'administrador/estadisticas', component: {} as any },
          { path: 'login', component: LoginComponent },
        ]),
        AuthService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    _authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);

    vi.spyOn(router, 'navigate');
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Verifica que el componente se cree correctamente. */
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /** Login exitoso */

  describe('login exitoso', () => {
    /** Verifica que llame a authService.login() y redirija a /administrador/estadisticas. */
    it('should call authService.login and navigate to admin on success', async () => {
      component.email.set('juan@mineduc.gob.gt');
      component.password.set('Password1');

      component.onLogin();

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

      const epersonReq = httpMock.expectOne('/server/api/eperson/epersons/eperson-001');
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
      });

      await fixture.whenStable();

      expect(router.navigate).toHaveBeenCalledWith(['/administrador/estadisticas']);
    });
  });

  /** Login fallido */

  describe('login fallido', () => {
    /** Verifica que muestre mensaje de error cuando las credenciales son incorrectas. */
    it('should show error message on failed login', async () => {
      component.email.set('juan@mineduc.gob.gt');
      component.password.set('wrong-password');

      component.onLogin();

      const loginReq = httpMock.expectOne('/server/api/authn/login');
      loginReq.flush(null, { status: 401, statusText: 'Unauthorized' });

      await fixture.whenStable();

      expect(component.errorMessage()).toBeTruthy();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
