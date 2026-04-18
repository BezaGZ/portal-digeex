import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from './auth.service';

/**
 * Interceptor que adjunta el JWT en el header Authorization.
 *
 * Lee el token de AuthService.getToken() y lo agrega como
 * Bearer en cada petición HTTP saliente.
 * Sin token, las peticiones pasan sin modificar.
 *
 * Ciclo 2 TDD — Sprint 5
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  if (token) {
    const authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
    return next(authReq);
  }

  return next(req);
};
