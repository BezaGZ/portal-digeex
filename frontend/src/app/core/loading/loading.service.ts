import { Injectable, computed, signal } from '@angular/core';
import { LoadingMode, LoadingOptions, LoadingProgress, LoadingTask } from './loading.model';

/**
 * Estado central de carga del portal. Mantiene una pila de tareas en vuelo;
 * la última iniciada gobierna mensaje y modo del overlay. No conoce PrimeNG:
 * solo expone estado para que el host lo pinte.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _tasks = signal<LoadingTask[]>([]);

  readonly active = computed(() => this._tasks().length > 0);

  /** La última tarea iniciada gobierna el overlay. */
  readonly current = computed<LoadingTask | null>(() => this._tasks().at(-1) ?? null);

  readonly message = computed(() => this.current()?.message ?? '');

  /** Determinado solo cuando hay más de un paso real que contar; si no, gira. */
  readonly mode = computed<LoadingMode>(() =>
    (this.current()?.progress?.total ?? 0) > 1 ? 'determinate' : 'indeterminate',
  );

  readonly percent = computed(() => {
    const progress = this.current()?.progress;
    return progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;
  });

  /** Inicia una tarea de carga y devuelve el id que `end` usa para cerrarla. */
  begin(opts: LoadingOptions): symbol {
    const id = Symbol();
    this._tasks.update((tasks) => [
      ...tasks,
      { id, message: opts.message, scope: opts.scope ?? 'global', progress: null },
    ]);
    return id;
  }

  /** Fija el progreso de una tarea; con total mayor a uno activa el modo determinado. */
  report(id: symbol, progress: LoadingProgress): void {
    this._tasks.update((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, progress } : task)),
    );
  }

  /** Cierra la tarea por id; cuando no queda ninguna viva, el overlay se oculta. */
  end(id: symbol): void {
    this._tasks.update((tasks) => tasks.filter((task) => task.id !== id));
  }
}
