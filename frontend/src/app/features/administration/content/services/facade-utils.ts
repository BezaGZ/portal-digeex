import { Observable, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

/**
 * Ejecuta una cascada de pasos de cleanup en orden, traga errores
 * individuales para que un fallo no aborte los siguientes, y al final
 * relanza el error original que disparó el rollback. Si no hay pasos,
 * relanza directamente. Sirve a los facades transaccionales que crean
 * varios recursos en cadena y necesitan deshacer lo construido cuando un
 * paso intermedio falla.
 */
export function rollbackCascade(
  steps: Observable<unknown>[],
  originalError: unknown,
): Observable<never> {
  if (steps.length === 0) {
    return throwError(() => originalError);
  }
  return steps
    .map((step) => step.pipe(catchError(() => of(undefined))))
    .reduce(
      (acc, next) => acc.pipe(switchMap(() => next)),
      of(undefined) as Observable<unknown>,
    )
    .pipe(switchMap(() => throwError(() => originalError)));
}
