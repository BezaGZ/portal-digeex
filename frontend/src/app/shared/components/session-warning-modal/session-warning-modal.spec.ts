import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SessionWarningModal } from './session-warning-modal';
import { IdleTimeoutService } from '../../../core/auth/idle-timeout.service';
import { SessionKeepaliveService } from '../../../core/auth/session-keepalive.service';
import { AuthService } from '../../../core/auth/auth.service';
import { HardRedirectService } from '../../../core/navigation/hard-redirect.service';

/**
 * Tests para SessionWarningModal.
 *
 * Modal que se muestra cuando el usuario lleva 25 min inactivo.
 * Ofrece dos opciones: "Seguir trabajando" (refresh + reset)
 * o "Cerrar sesión" (logout + recarga dura al login).
 * Si llega a 30 min, ejecuta logout automático.
 *
 * Ciclo 3 TDD — Sprint 5. Recarga dura en Ciclo 43 — Sprint 8. Ajustado en
 * Ciclo 49 (Sprint 10): la expiración automática arrastra returnUrl; el
 * cierre manual queda limpio. Ajustado en Ciclo 8 (Sprint 11): el keepalive
 * también dispara el cierre automático.
 */
describe('SessionWarningModal', () => {
  let component: SessionWarningModal;
  let fixture: ComponentFixture<SessionWarningModal>;
  let idleService: IdleTimeoutService;
  let keepaliveService: SessionKeepaliveService;
  let authService: AuthService;
  let hardRedirect: { redirect: ReturnType<typeof vi.fn>; getCurrentRoute: () => string };

  /** Setup */

  beforeEach(() => {
    hardRedirect = { redirect: vi.fn(), getCurrentRoute: () => '/administrador/envios/abc' };

    TestBed.configureTestingModule({
      imports: [SessionWarningModal],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        IdleTimeoutService,
        AuthService,
        { provide: HardRedirectService, useValue: hardRedirect },
      ],
    });

    fixture = TestBed.createComponent(SessionWarningModal);
    component = fixture.componentInstance;
    idleService = TestBed.inject(IdleTimeoutService);
    keepaliveService = TestBed.inject(SessionKeepaliveService);
    authService = TestBed.inject(AuthService);
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  /** Visibilidad */

  describe('visibility', () => {
    /** Verifica que el modal sea visible cuando warningVisible es true. */
    it('should be visible when warningVisible is true', () => {
      idleService.warningVisible.set(true);
      fixture.detectChanges();

      const modal = fixture.nativeElement.querySelector('[data-testid="session-warning-modal"]');
      expect(modal).toBeTruthy();
    });

    /** Verifica que el modal NO sea visible cuando warningVisible es false. */
    it('should NOT be visible when warningVisible is false', () => {
      idleService.warningVisible.set(false);
      fixture.detectChanges();

      const modal = fixture.nativeElement.querySelector('[data-testid="session-warning-modal"]');
      expect(modal).toBeFalsy();
    });
  });

  /** Botón "Seguir trabajando" */

  describe('keep working', () => {
    /** Verifica que el botón llame a refreshToken y resetee el idle. */
    it('should call refreshToken and reset idle on "Seguir trabajando"', () => {
      const { Observable } = require('rxjs');
      vi.spyOn(authService, 'refreshToken').mockReturnValue(
        new Observable((subscriber: { next: (v: undefined) => void; complete: () => void }) => {
          subscriber.next(undefined);
          subscriber.complete();
        }),
      );

      idleService.warningVisible.set(true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[data-testid="btn-continue"] button');
      button.click();

      expect(authService.refreshToken).toHaveBeenCalled();
      expect(idleService.warningVisible()).toBe(false);
    });

    /** Si el refresh falla la sesión no se pudo extender: se fuerza el logout. */
    it('should force logout when refreshToken fails on "Seguir trabajando"', () => {
      const { Observable, throwError } = require('rxjs');
      vi.spyOn(authService, 'refreshToken').mockReturnValue(
        throwError(() => new Error('refresh failed')),
      );
      vi.spyOn(authService, 'logout').mockReturnValue(
        new Observable((subscriber: { next: (v: unknown) => void; complete: () => void }) => {
          subscriber.next(undefined);
          subscriber.complete();
        }),
      );

      idleService.warningVisible.set(true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[data-testid="btn-continue"] button');
      button.click();

      expect(authService.logout).toHaveBeenCalled();
      expect(hardRedirect.redirect).toHaveBeenCalledWith(
        `/iniciar-sesion?expired=true&returnUrl=${encodeURIComponent('/administrador/envios/abc')}`,
      );
    });
  });

  /** Botón "Cerrar sesión" */

  describe('log out', () => {
    /** Verifica que el botón llame a logout y haga la recarga dura al login. */
    it('should call logout and hard-redirect to login on "Cerrar sesión"', () => {
      const { Observable } = require('rxjs');
      vi.spyOn(authService, 'logout').mockReturnValue(
        new Observable((subscriber: { next: (v: unknown) => void; complete: () => void }) => {
          subscriber.next(undefined);
          subscriber.complete();
        }),
      );

      idleService.warningVisible.set(true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[data-testid="btn-logout"] button');
      button.click();

      expect(authService.logout).toHaveBeenCalled();
      expect(hardRedirect.redirect).toHaveBeenCalledWith('/iniciar-sesion');
    });

    /** El redirect depende de la respuesta del logout: con la petición en vuelo aún no recarga. */
    it('should not redirect until the logout request settles', () => {
      const { Observable } = require('rxjs');
      vi.spyOn(authService, 'logout').mockReturnValue(new Observable(() => {}));

      idleService.warningVisible.set(true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[data-testid="btn-logout"] button');
      button.click();

      expect(hardRedirect.redirect).not.toHaveBeenCalled();
    });

    /** Aunque el logout falle en el backend, el usuario debe terminar en login. */
    it('should still hard-redirect to login when logout fails', () => {
      const { throwError } = require('rxjs');
      vi.spyOn(authService, 'logout').mockReturnValue(
        throwError(() => new Error('logout failed')),
      );

      idleService.warningVisible.set(true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[data-testid="btn-logout"] button');
      button.click();

      expect(hardRedirect.redirect).toHaveBeenCalledWith('/iniciar-sesion');
    });
  });

  /** Expiración automática */

  describe('automatic expiration', () => {
    /** Verifica que ejecute logout automático cuando sessionExpired es true. */
    it('should auto-logout when sessionExpired becomes true', () => {
      const { Observable } = require('rxjs');
      vi.spyOn(authService, 'logout').mockReturnValue(
        new Observable((subscriber: { next: (v: unknown) => void; complete: () => void }) => {
          subscriber.next(undefined);
          subscriber.complete();
        }),
      );

      idleService.sessionExpired.set(true);
      fixture.detectChanges();

      expect(authService.logout).toHaveBeenCalled();
      expect(hardRedirect.redirect).toHaveBeenCalledWith(
        `/iniciar-sesion?expired=true&returnUrl=${encodeURIComponent('/administrador/envios/abc')}`,
      );
    });

    /** Verifica que ejecute logout automático cuando el keepalive marca la sesión expirada. */
    it('should auto-logout when the keepalive flags the session as expired', () => {
      const { Observable } = require('rxjs');
      vi.spyOn(authService, 'logout').mockReturnValue(
        new Observable((subscriber: { next: (v: unknown) => void; complete: () => void }) => {
          subscriber.next(undefined);
          subscriber.complete();
        }),
      );

      keepaliveService.sessionExpired.set(true);
      fixture.detectChanges();

      expect(authService.logout).toHaveBeenCalled();
      expect(hardRedirect.redirect).toHaveBeenCalledWith(
        `/iniciar-sesion?expired=true&returnUrl=${encodeURIComponent('/administrador/envios/abc')}`,
      );
    });
  });
});
