import { Observable } from 'rxjs';
import { Actor, Caller } from './caller.model';

/**
 * Contrato que el core (guards, autorización) usa para conocer al usuario
 * actual sin depender de la feature que lo implementa. La implementación
 * concreta (`AuthCallerService`, que lee de `UserManagementService`) vive en
 * features y se cablea a este token en `app.config`.
 */
export abstract class CallerProvider {
  abstract readonly currentCaller$: Observable<Caller | null>;
  abstract readonly currentActor$: Observable<Actor | null>;

  /**
   * Snapshot síncrono del caller derivado de la sesión viva, no del stream
   * cacheado `currentCaller$`: su `shareReplay` puede emitir el caller del
   * usuario anterior hasta que el `toObservable(currentEPerson)` propaga.
   */
  abstract currentCallerSnapshot(): Caller | null;
}
