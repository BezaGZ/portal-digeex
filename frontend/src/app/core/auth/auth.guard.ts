import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard funcional que protege rutas de administración.
 *
 * Verifica si el usuario está autenticado antes de permitir
 * el acceso a rutas protegidas. Sin sesión, redirige a /login.
 *
 * Ciclo 3 TDD — Sprint 5
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
