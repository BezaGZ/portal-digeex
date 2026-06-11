import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserManagementService } from '../../users/services/user-management.service';
import { Actor, Caller } from '../../content/specifications/scope-context.model';

/**
 * Proyección del usuario autenticado en la forma que las reglas de scope
 * y la auditoría esperan: `currentCaller$` expone rol y sufijo para validar
 * scope; `currentActor$` expone nombre y correo para registrar autoría en
 * el provenance. Ambos derivan del mismo `currentUserView$`.
 */
@Injectable({ providedIn: 'root' })
export class AuthCallerService {
  private readonly userMgmt = inject(UserManagementService);

  // view.role nunca es null acá (currentUserView$ corta la sesión huérfana
  // con error antes de emitir); el guard solo estrecha el tipo.
  readonly currentCaller$: Observable<Caller | null> = this.userMgmt.currentUserView$.pipe(
    map((view) =>
      view && view.role !== null
        ? { role: view.role, sufijo: view.subdivision }
        : null,
    ),
  );

  readonly currentActor$: Observable<Actor | null> = this.userMgmt.currentUserView$.pipe(
    map((view) =>
      view
        ? { firstName: view.firstName, lastName: view.lastName, email: view.email }
        : null,
    ),
  );
}
