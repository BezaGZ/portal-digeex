import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, take } from 'rxjs/operators';
import { of } from 'rxjs';

import { UserManagementService } from '../services/user-management.service';

/**
 * Reserva la ruta al site admin. `/api/eperson/epersons` y `/api/eperson/groups`
 * exigen `hasAuthority('ADMIN')` en DSpace 9.2, así que un community admin
 * aterrizaría en 403; el redirect corta antes de pegarle al backend.
 */
export const superadminGuard: CanActivateFn = () => {
  const userService = inject(UserManagementService);
  const router = inject(Router);
  const fallback = router.createUrlTree(['/administrador/estadisticas']);

  return userService.currentUserView$.pipe(
    take(1),
    map((view) => (view?.role === 'superadmin' ? true : fallback)),
    catchError(() => of(fallback)),
  );
};
