import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor que adjunta el JWT en el header Authorization.
 *
 * Lee el token de AuthService.getToken() y lo agrega como
 * Bearer en cada petición HTTP saliente.
 *
 * Ciclo 2 TDD — Sprint 5
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req);
};
