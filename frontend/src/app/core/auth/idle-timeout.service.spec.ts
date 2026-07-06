import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { IdleTimeoutService } from './idle-timeout.service';

/**
 * Tests para IdleTimeoutService.
 *
 * Servicio que rastrea la actividad del usuario en el DOM
 * y emite señales de advertencia (25 min) y expiración (30 min)
 * para gestionar el timeout de sesión según DT-02 y DT-03.
 *
 * Ciclo 3 TDD — Sprint 5. Ajustado en Ciclo 1 (Sprint 9) y Ciclo 64 (Sprint 10).
 */
describe('IdleTimeoutService', () => {
  let service: IdleTimeoutService;

  /** Constantes de tiempo en milisegundos */
  const ONE_MINUTE_MS = 60_000;
  const WARNING_TIME_MS = 25 * ONE_MINUTE_MS;
  const TIMEOUT_TIME_MS = 30 * ONE_MINUTE_MS;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        IdleTimeoutService,
      ],
    });

    service = TestBed.inject(IdleTimeoutService);
  });

  afterEach(() => {
    service.stop();
  });

  /** Verifica que el servicio se instancie correctamente. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** Estado inicial */

  describe('initial state', () => {
    /** Verifica que los signals empiecen en false/false. */
    it('should start with warningVisible false and sessionExpired false', () => {
      expect(service.warningVisible()).toBe(false);
      expect(service.sessionExpired()).toBe(false);
    });
  });

  /** Rastreo de actividad */

  describe('activity tracking', () => {
    /** Verifica que registre el timestamp al detectar click. */
    it('should track last activity timestamp on click', fakeAsync(() => {
      service.start();
      const before = Date.now();
      document.dispatchEvent(new Event('click'));
      tick(0);
      expect(service.lastActivity()).toBeGreaterThanOrEqual(before);
    }));

    /** Verifica que registre el timestamp al detectar keydown. */
    it('should track last activity timestamp on keydown', fakeAsync(() => {
      service.start();
      const before = Date.now();
      document.dispatchEvent(new Event('keydown'));
      tick(0);
      expect(service.lastActivity()).toBeGreaterThanOrEqual(before);
    }));

    /** Verifica que registre el timestamp al detectar mousemove. */
    it('should track last activity timestamp on mousemove', fakeAsync(() => {
      service.start();
      const before = Date.now();
      document.dispatchEvent(new Event('mousemove'));
      tick(0);
      expect(service.lastActivity()).toBeGreaterThanOrEqual(before);
    }));

    /** Verifica que registre el timestamp al detectar scroll. */
    it('should track last activity timestamp on scroll', fakeAsync(() => {
      service.start();
      const before = Date.now();
      document.dispatchEvent(new Event('scroll'));
      tick(0);
      expect(service.lastActivity()).toBeGreaterThanOrEqual(before);
    }));
  });

  /** Warning a los 25 minutos */

  describe('warning at 25 min', () => {
    /** Verifica que warningVisible sea true a los 25 min sin actividad. */
    it('should emit warning at 25 min idle', fakeAsync(() => {
      service.start();
      expect(service.warningVisible()).toBe(false);

      tick(WARNING_TIME_MS);

      expect(service.warningVisible()).toBe(true);
      expect(service.sessionExpired()).toBe(false);
    }));
  });

  /** Timeout a los 30 minutos */

  describe('timeout at 30 min', () => {
    /** Verifica que sessionExpired sea true a los 30 min sin actividad. */
    it('should emit timeout at 30 min idle', fakeAsync(() => {
      service.start();

      tick(TIMEOUT_TIME_MS);

      expect(service.sessionExpired()).toBe(true);
    }));
  });

  /** Reset por interacción */

  describe('reset on interaction', () => {
    /** Verifica que la interacción del usuario resetee el timer y oculte el warning. */
    it('should reset on user interaction after warning', fakeAsync(() => {
      service.start();

      tick(WARNING_TIME_MS);
      expect(service.warningVisible()).toBe(true);

      document.dispatchEvent(new Event('click'));
      tick(0);

      expect(service.warningVisible()).toBe(false);
      expect(service.sessionExpired()).toBe(false);
    }));

    /** Con el aviso visible, mover el mouse no lo cierra. */
    it('should NOT hide the warning on mousemove once visible', fakeAsync(() => {
      service.start();
      service.warningVisible.set(true);

      document.dispatchEvent(new Event('mousemove'));
      tick(0);

      expect(service.warningVisible()).toBe(true);
    }));

    /** Con el aviso visible, un click deliberado sí lo cierra. */
    it('should hide the warning on click once visible', fakeAsync(() => {
      service.start();
      service.warningVisible.set(true);

      document.dispatchEvent(new Event('click'));
      tick(0);

      expect(service.warningVisible()).toBe(false);
    }));

    /**
     * Verifica que volver a la pestaña expire la sesión si el plazo ya venció.
     * Los navegadores ralentizan los setTimeout en segundo plano y el timer puede no haber disparado.
     */
    it('should expire the session on tab return when the idle deadline already passed', fakeAsync(() => {
      service.start();
      service.lastActivity.set(Date.now() - TIMEOUT_TIME_MS - ONE_MINUTE_MS);

      document.dispatchEvent(new Event('visibilitychange'));
      tick(0);

      expect(service.sessionExpired()).toBe(true);
    }));

    /** Verifica que volver a la pestaña con 25-30 min transcurridos muestre el aviso sin expirar. */
    it('should show the warning on tab return when elapsed idle is between 25 and 30 min', fakeAsync(() => {
      service.start();
      service.lastActivity.set(Date.now() - WARNING_TIME_MS - ONE_MINUTE_MS);

      document.dispatchEvent(new Event('visibilitychange'));
      tick(0);

      expect(service.warningVisible()).toBe(true);
      expect(service.sessionExpired()).toBe(false);
    }));

    /** Verifica que volver a la pestaña antes de los 25 min no cambie nada. */
    it('should keep the session untouched on tab return before the warning threshold', fakeAsync(() => {
      service.start();
      service.lastActivity.set(Date.now() - ONE_MINUTE_MS);

      document.dispatchEvent(new Event('visibilitychange'));
      tick(0);

      expect(service.warningVisible()).toBe(false);
      expect(service.sessionExpired()).toBe(false);
    }));

    /** Verifica que la actividad posterior a la expiración no reviva la sesión. */
    it('should NOT reset the expired state on user activity', fakeAsync(() => {
      service.start();
      service.sessionExpired.set(true);

      document.dispatchEvent(new Event('click'));
      tick(0);

      expect(service.sessionExpired()).toBe(true);
      expect(service.warningVisible()).toBe(false);
    }));

    /** Verifica que después de reset, el ciclo de 25+30 min reinicie. */
    it('should restart the full idle cycle after reset', fakeAsync(() => {
      service.start();

      tick(WARNING_TIME_MS);
      expect(service.warningVisible()).toBe(true);

      document.dispatchEvent(new Event('click'));
      tick(0);
      expect(service.warningVisible()).toBe(false);

      tick(WARNING_TIME_MS);
      expect(service.warningVisible()).toBe(true);

      tick(TIMEOUT_TIME_MS - WARNING_TIME_MS);
      expect(service.sessionExpired()).toBe(true);
    }));
  });
});
