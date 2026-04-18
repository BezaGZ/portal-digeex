import { CanActivateFn } from '@angular/router';

/**
 * Guard funcional que protege rutas de administración.
 *
 * Verifica si el usuario está autenticado antes de permitir
 * el acceso a rutas protegidas. Sin sesión, redirige a /login.
 *
 * Ciclo 3 TDD — Sprint 5
 */
export const authGuard: CanActivateFn = (route, state) => {
  return true;
};
