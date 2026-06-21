import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { filter, map, take } from 'rxjs/operators';

import { CallerProvider } from './caller-provider';
import { Caller } from './caller.model';
import { UserRole } from './user-role.model';

/**
 * Factory de `CanActivateFn` parametrizado por roles permitidos. Se encadena
 * después del `authGuard` en `canActivate: [authGuard, roleGuard([...])]`:
 * el primero garantiza sesión, el segundo filtra por rol y redirige a
 * `/administrador` con toast `OUT_OF_SCOPE` cuando el rol no aplica. Espera
 * el primer caller resuelto (`!= null`) porque `AuthCallerService` emite
 * `null` mientras la vista del usuario aún no se carga.
 */
export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const authCaller = inject(CallerProvider);
    const router = inject(Router);
    const message = inject(MessageService);

    return authCaller.currentCaller$.pipe(
      filter((caller): caller is Caller => caller !== null),
      take(1),
      map((caller) => {
        if (allowedRoles.includes(caller.role as UserRole)) {
          return true;
        }
        message.add({
          severity: 'warn',
          summary: 'OUT_OF_SCOPE',
          detail: 'No tienes acceso a esta sección.',
        });
        return router.createUrlTree(['/administrador']);
      }),
    );
  };
}
