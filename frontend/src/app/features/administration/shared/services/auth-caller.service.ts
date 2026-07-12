import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { UserManagementService } from '../../users/services/user-management.service';
import { Actor, Caller } from '../../../../core/auth/caller.model';
import { CallerProvider } from '../../../../core/auth/caller-provider';
import { AuthService } from '../../../../core/auth/auth.service';
import { RoleAuthorizationService } from '../../../../core/auth/role-authorization.service';
import { ScopeAuthorizationService } from '../../../../core/auth/scope-authorization.service';

/**
 * Identidad del usuario autenticado afirmada por el backend: el rol sale de
 * las features de Site y el scope de los searches autorizados, nunca de
 * nombres de grupo. Se resuelve una vez por sesión y se comparte
 * (`shareReplay`); huérfano (ninguna feature) emite null. `currentActor$`
 * deriva de la vista del usuario porque describe identidad (nombre, correo),
 * no permisos. Implementa `CallerProvider` de core; se cablea en `app.config`.
 */
@Injectable({ providedIn: 'root' })
export class AuthCallerService extends CallerProvider {
  private readonly userMgmt = inject(UserManagementService);
  private readonly authService = inject(AuthService);
  private readonly roleAuthz = inject(RoleAuthorizationService);
  private readonly scopeAuthz = inject(ScopeAuthorizationService);

  override readonly currentCaller$: Observable<Caller | null> = toObservable(
    this.authService.currentEPerson,
  ).pipe(
    switchMap((eperson) => {
      if (!eperson) {
        return of<Caller | null>(null);
      }
      return this.roleAuthz.resolveRole$().pipe(
        switchMap((role) => {
          if (role === null) {
            return of<Caller | null>(null);
          }
          return this.scopeAuthz
            .resolveScopeUuid$(role)
            .pipe(map((scopeUuid): Caller => ({ role, scopeUuid })));
        }),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  override readonly currentActor$: Observable<Actor | null> = this.userMgmt.currentUserView$.pipe(
    map((view) =>
      view
        ? { firstName: view.firstName, lastName: view.lastName, email: view.email }
        : null,
    ),
  );
}
