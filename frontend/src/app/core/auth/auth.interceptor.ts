import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from './auth.service';

/** Umbral en segundos para disparar refresh automático (5 minutos). */
const REFRESH_THRESHOLD_SECONDS = 300;

/**
 * Interceptor que adjunta el JWT en el header Authorization
 * y dispara refresh automático cuando el token está próximo a expirar.
 *
 * Lee el token de AuthService.getToken() y lo agrega como
 * Bearer en cada petición HTTP saliente.
 * Si el claim `exp` del JWT indica que faltan menos de 5 minutos,
 * dispara `authService.refreshToken()` en background sin bloquear
 * la petición original.
 *
 * Sin token, las peticiones pasan sin modificar.
 *
 * Ciclo 2 TDD — Sprint 5
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  if (token) {
    if (isTokenExpiringSoon(token)) {
      authService.refreshToken().subscribe();
    }

    const authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
    return next(authReq);
  }

  return next(req);
};

/**
 * Decodifica el payload del JWT y verifica si el claim `exp`
 * indica que faltan menos de REFRESH_THRESHOLD_SECONDS.
 */
function isTokenExpiringSoon(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) { return false; }

    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) { return false; }

    const nowSeconds = Math.floor(Date.now() / 1000);
    return (payload.exp - nowSeconds) < REFRESH_THRESHOLD_SECONDS;
  } catch {
    return false;
  }
}
