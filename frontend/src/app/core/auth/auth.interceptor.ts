import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, OperatorFunction, catchError, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Umbral en segundos para disparar refresh automático (5 minutos). */
const REFRESH_THRESHOLD_SECONDS = 300;

/**
 * Observable compartido del refresh en curso.
 * Garantiza que múltiples peticiones concurrentes disparen
 * una sola llamada a refreshToken() de DSpace.
 * Se limpia al completarse para permitir futuros refreshes.
 */
let refreshInProgress$: Observable<void> | null = null;

/**
 * Interceptor que adjunta el JWT en el header Authorization,
 * dispara refresh automático cuando el token está próximo a expirar
 * y redirige al login si DSpace responde 401.
 *
 * Flujo con token próximo a expirar:
 * 1. Detecta que faltan menos de 5 minutos (claim `exp`)
 * 2. Espera a que el refresh complete (POST /api/authn/login con Bearer)
 * 3. Reenvía la petición original con el token renovado
 *
 * Flujo con token vigente:
 * 1. Adjunta Authorization: Bearer en la petición
 * 2. Si DSpace responde 401, redirige a /login
 *
 * Sin token, las peticiones pasan sin modificar.
 *
 * Ciclo 2 TDD — Sprint 5
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (!token) {
    return next(req);
  }

  if (isTokenExpiringSoon(token)) {
    return getRefresh$(authService).pipe(
      switchMap(() => {
        const freshToken = authService.getToken() ?? token;
        const authReq = req.clone({
          setHeaders: { Authorization: `Bearer ${freshToken}` },
        });
        return next(authReq);
      }),
      redirectOn401(router),
    );
  }

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authReq).pipe(redirectOn401(router));
};

/**
 * Operador que intercepta respuestas 401 (Unauthorized)
 * y redirige al usuario a la pantalla de login.
 */
function redirectOn401<T>(router: Router): OperatorFunction<T, T> {
  return catchError((error: { status?: number }) => {
    if (error.status === 401) {
      router.navigate(['/login']);
    }
    return throwError(() => error);
  });
}

/**
 * Obtiene o crea el Observable compartido del refresh en curso.
 * Usa shareReplay(1) para que múltiples peticiones concurrentes
 * compartan la misma llamada a DSpace sin disparar otra.
 */
function getRefresh$(authService: AuthService): Observable<void> {
  if (!refreshInProgress$) {
    refreshInProgress$ = authService.refreshToken().pipe(
      shareReplay(1),
      tap({ complete: () => { refreshInProgress$ = null; } }),
    );
  }
  return refreshInProgress$;
}

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
