import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { isTokenExpired } from './token-expiry.util';
import { resolvePostLoginRoute } from './post-login-route';

/**
 * Guard del login: con sesión activa y JWT vigente redirige al panel (o al
 * `returnUrl` interno). DSpace trata un login con Bearer como refresh de la
 * sesión vieja; con token vencido deja pasar porque esa sesión ya no sirve.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.getToken();
  if (!authService.isAuthenticated() || !token || isTokenExpired(token)) {
    return true;
  }

  const returnUrl = route.queryParamMap.get('returnUrl');
  return router.parseUrl(resolvePostLoginRoute(returnUrl));
};
