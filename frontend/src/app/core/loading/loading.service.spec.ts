import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

/**
 * Tests de `LoadingService`.
 *
 * Estado central de carga basado en una pila de tareas en vuelo: la última
 * iniciada gobierna mensaje y modo. Cubre alta y baja de tareas, mensaje
 * actual y el cálculo determinado/indeterminado del progreso.
 *
 * Ciclo 45 TDD — Sprint 8.
 */
describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LoadingService] });
    service = TestBed.inject(LoadingService);
  });

  /** Verifica que active() pase a true cuando se inicia una tarea. */
  it('should report active when a task begins', () => {
    expect(service.active()).toBe(false);
    service.begin({ message: 'Cargando…' });
    expect(service.active()).toBe(true);
  });

  /** Verifica que active() vuelva a false cuando la tarea termina. */
  it('should clear active when the task ends', () => {
    const id = service.begin({ message: 'Cargando…' });
    service.end(id);
    expect(service.active()).toBe(false);
  });

  /** Verifica que message() exponga el mensaje de la última tarea iniciada. */
  it('should expose the message of the last begun task', () => {
    service.begin({ message: 'Primera' });
    service.begin({ message: 'Segunda' });
    expect(service.message()).toBe('Segunda');
  });

  /** Verifica que report() ponga modo determinado y calcule el porcentaje cuando total supera uno. */
  it('should switch to determinate mode and compute percent when total exceeds one', () => {
    const id = service.begin({ message: 'Subiendo…' });
    service.report(id, { current: 3, total: 6 });
    expect(service.mode()).toBe('determinate');
    expect(service.percent()).toBe(50);
  });

  /** Verifica que el modo siga indeterminado cuando total es uno o menos. */
  it('should stay indeterminate when total is one or less', () => {
    const id = service.begin({ message: 'Guardando…' });
    service.report(id, { current: 1, total: 1 });
    expect(service.mode()).toBe('indeterminate');
  });
});
