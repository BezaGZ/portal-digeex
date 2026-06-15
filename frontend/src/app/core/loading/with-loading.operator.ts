import { MonoTypeOperatorFunction, defer, finalize } from 'rxjs';
import { LoadingOptions } from './loading.model';
import { LoadingService } from './loading.service';

/**
 * Enrola un Observable al `LoadingService`: `defer` inicia la tarea al
 * suscribir y `finalize` la libera en complete, error o unsubscribe, así el
 * contador nunca queda colgado y el unsubscribe deja lista una cancelación.
 */
export function withLoading<T>(
  loading: LoadingService,
  opts: LoadingOptions,
): MonoTypeOperatorFunction<T> {
  return (source$) =>
    defer(() => {
      const id = loading.begin(opts);
      return source$.pipe(finalize(() => loading.end(id)));
    });
}
