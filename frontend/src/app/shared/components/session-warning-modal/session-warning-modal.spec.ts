import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SessionWarningModal } from './session-warning-modal';
import { IdleTimeoutService } from '../../../core/auth/idle-timeout.service';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Tests para SessionWarningModal.
 *
 * Modal que se muestra cuando el usuario lleva 25 min inactivo.
 * Ofrece dos opciones: "Seguir trabajando" (refresh + reset)
 * o "Cerrar sesión" (logout + redirect a /login).
 * Si llega a 30 min, ejecuta logout automático.
 *
 * Ciclo 3 TDD — Sprint 5
 */
describe('SessionWarningModal', () => {
  let component: SessionWarningModal;
  let fixture: ComponentFixture<SessionWarningModal>;
  let idleService: IdleTimeoutService;
  let authService: AuthService;
  let router: Router;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SessionWarningModal],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        IdleTimeoutService,
        AuthService,
      ],
    });

    fixture = TestBed.createComponent(SessionWarningModal);
    component = fixture.componentInstance;
    idleService = TestBed.inject(IdleTimeoutService);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
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

      const button = fixture.nativeElement.querySelector('[data-testid="btn-continue"]');
      button.click();

      expect(authService.refreshToken).toHaveBeenCalled();
      expect(idleService.warningVisible()).toBe(false);
    });
  });

  /** Botón "Cerrar sesión" */

  describe('log out', () => {
    /** Verifica que el botón llame a logout y redirija a /login. */
    it('should call logout and navigate to /login on "Cerrar sesión"', () => {
      const { Observable } = require('rxjs');
      vi.spyOn(authService, 'logout').mockReturnValue(
        new Observable((subscriber: { next: (v: unknown) => void; complete: () => void }) => {
          subscriber.next(undefined);
          subscriber.complete();
        }),
      );
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      idleService.warningVisible.set(true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[data-testid="btn-logout"]');
      button.click();

      expect(authService.logout).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/iniciar-sesion']);
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
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      idleService.sessionExpired.set(true);
      fixture.detectChanges();

      expect(authService.logout).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/iniciar-sesion']);
    });
  });
});
