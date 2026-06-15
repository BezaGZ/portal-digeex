/** Determinado cuando hay un conteo real que mostrar; indeterminado en el resto. */
export type LoadingMode = 'indeterminate' | 'determinate';

/** Avance contable de una operación; alimenta el modo determinado. */
export interface LoadingProgress {
  current: number;
  total: number;
}

/** 'global' bloquea toda la pantalla; cualquier otro string identifica una región. */
export interface LoadingOptions {
  message: string;
  scope?: 'global' | string;
}

/** Una operación en vuelo. La pila de tareas vivas gobierna el overlay. */
export interface LoadingTask {
  id: symbol;
  message: string;
  scope: 'global' | string;
  progress: LoadingProgress | null;
}
