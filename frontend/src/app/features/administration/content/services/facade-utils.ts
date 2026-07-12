import { MonoTypeOperatorFunction, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Caller } from '../specifications/scope-context.model';
import { AuditDsoType, AuditTrailService } from '../provenance/audit-trail.service';

/**
 * Resuelve el caller actual a la forma que las reglas de scope esperan.
 * Si no hay sesión activa, devuelve el caller mínimo (rol con menos
 * privilegios) para que los specs traten al usuario anónimo igual que a
 * un personal_delegado sin scope y nunca le permitan operar sobre nada.
 */
export function resolveCaller$(authCaller: AuthCallerService): Observable<Caller> {
  return authCaller.currentCaller$.pipe(
    take(1),
    map((caller) => caller ?? { role: 'personal_delegado', scopeUuid: null }),
  );
}

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

/**
 * Operador best-effort que appendea una entrada de provenance al cierre del
 * pipeline exitoso. El error del audit NO rompe la operación principal: el
 * facade emite el DSO original aunque el PATCH del audit falle. Reusado por
 * los 3 facades del Bloque 3 sobre items, communities y collections.
 */
export function withAudit$<T extends { uuid: string }>(
  audit: AuditTrailService,
  dsoType: AuditDsoType,
  action: string,
): MonoTypeOperatorFunction<T> {
  return (source$) =>
    source$.pipe(
      switchMap((dso) =>
        audit
          .appendProvenance$(dsoType, dso.uuid, action)
          .pipe(catchError(() => of(undefined)), map(() => dso)),
      ),
    );
}
