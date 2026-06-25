import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserManagementService } from '../../users/services/user-management.service';
import { Actor, Caller } from '../../../../core/auth/caller.model';
import { CallerProvider } from '../../../../core/auth/caller-provider';

/**
 * Proyección del usuario autenticado en la forma que las reglas de scope
 * y la auditoría esperan: `currentCaller$` expone rol y sufijo para validar
 * scope; `currentActor$` expone nombre y correo para registrar autoría en
 * el provenance. Ambos derivan del mismo `currentUserView$`. Implementa el
 * contrato `CallerProvider` de core para que los guards no dependan de esta
 * feature; el token se cablea en `app.config`.
 */
@Injectable({ providedIn: 'root' })
export class AuthCallerService extends CallerProvider {
  private readonly userMgmt = inject(UserManagementService);

  // view.role nunca es null acá (currentUserView$ corta la sesión huérfana
  // con error antes de emitir); el guard solo estrecha el tipo.
  override readonly currentCaller$: Observable<Caller | null> = this.userMgmt.currentUserView$.pipe(
    map((view) =>
      view && view.role !== null
        ? { role: view.role, sufijo: view.subdivision }
        : null,
    ),
  );

  override readonly currentActor$: Observable<Actor | null> = this.userMgmt.currentUserView$.pipe(
    map((view) =>
      view
        ? { firstName: view.firstName, lastName: view.lastName, email: view.email }
        : null,
    ),
  );

  /** Snapshot síncrono del caller; delega en la resolución desde el EPerson vivo. */
  override currentCallerSnapshot(): Caller | null {
    return this.userMgmt.resolveCallerSnapshot();
  }
}
