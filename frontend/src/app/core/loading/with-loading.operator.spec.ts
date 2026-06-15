import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { LoadingService } from './loading.service';
import { withLoading } from './with-loading.operator';

/**
 * Tests de `withLoading`.
 *
 * Operador que enrola un Observable al `LoadingService`: inicia la tarea al
 * suscribir y la libera con `finalize` en complete, error o unsubscribe (sin
 * fugas; el caso unsubscribe es la base de una cancelación futura).
 *
 * Ciclo 45 TDD — Sprint 8.
 */
describe('withLoading', () => {
  let loading: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LoadingService] });
    loading = TestBed.inject(LoadingService);
  });

  /** Verifica que la tarea se inicie al suscribir y se libere al completar. */
  it('should begin the task on subscribe and end it on complete', () => {
    let activeDuringEmit = false;
    of('x')
      .pipe(withLoading(loading, { message: 'Cargando…' }))
      .subscribe(() => (activeDuringEmit = loading.active()));
    expect(activeDuringEmit).toBe(true);
    expect(loading.active()).toBe(false);
  });

  /** Verifica que la tarea se libere cuando el source emite error. */
  it('should end the task on error', () => {
    throwError(() => new Error('falló'))
      .pipe(withLoading(loading, { message: 'Cargando…' }))
      .subscribe({ error: () => undefined });
    expect(loading.active()).toBe(false);
  });

  /** Verifica que la tarea se libere al desuscribir (base de cancelación). */
  it('should end the task on unsubscribe', () => {
    const source = new Subject<number>();
    const sub = source.pipe(withLoading(loading, { message: 'Cargando…' })).subscribe();
    expect(loading.active()).toBe(true);
    sub.unsubscribe();
    expect(loading.active()).toBe(false);
  });
});
