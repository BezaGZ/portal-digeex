import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserManagementService } from '../../users/services/user-management.service';
import { Caller } from '../../content/specifications/scope-context.model';

/**
 * Proyección del usuario autenticado en la forma que las reglas de scope
 * esperan: rol del portal y sufijo de subdirección. Encapsula la lectura
 * de la vista del usuario para que los facades no dependan directamente
 * del servicio de gestión de usuarios.
 */
@Injectable({ providedIn: 'root' })
export class AuthCallerService {
  private readonly userMgmt = inject(UserManagementService);

  readonly currentCaller$: Observable<Caller | null> = this.userMgmt.currentUserView$.pipe(
    map((view) =>
      view
        ? { role: view.role, sufijo: view.subdivision }
        : null,
    ),
  );
}
