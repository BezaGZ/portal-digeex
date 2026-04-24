import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard funcional que protege rutas de administración.
 *
 * Verifica si el usuario está autenticado antes de permitir el acceso. Sin
 * sesión, redirige a `/login` y guarda la URL destino en el queryParam
 * `returnUrl` para que el flujo de login, al terminar, devuelva al usuario
 * exactamente a la pantalla que quería abrir.
 *
 * Ciclo 3 TDD — Sprint 5
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
