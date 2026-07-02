import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Observable, OperatorFunction, catchError, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { HardRedirectService } from '../navigation/hard-redirect.service';

/** Umbral en segundos para disparar refresh anticipado (5 minutos). */
const REFRESH_THRESHOLD_SECONDS = 300;

/**
 * Observable compartido del refresh en curso. Garantiza que múltiples peticiones
 * concurrentes disparen una sola llamada a refreshToken() de DSpace. Se limpia al
 * completarse para permitir futuros refreshes.
 */
let refreshInProgress$: Observable<void> | null = null;

/**
 * Adjunta el JWT y refresca anticipadamente. Ante un 401 redirige al login solo si
 * el token venció localmente; con token válido propaga sin redirigir (no atrapa lo
 * público). `/authn/*` recibe Bearer pero salta refresh y redirect (sin recursión).
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const hardRedirect = inject(HardRedirectService);
  const token = authService.getToken();

  if (!token) {
    return next(req);
  }

  // Endpoints anónimos de DSpace 9 que no deben llevar el JWT del caller.
  // `/eperson/registrations` es permitAll, pero el filtro valida el Bearer antes
  // y rechaza con 401 uno expirado, rompiendo el reset por token.
  // `/statistics/viewevents` registra visitas anónimas; con Bearer de admin
  // DSpace filtra el hit.
  if (req.url.includes('/eperson/registrations') || req.url.includes('/statistics/viewevents')) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  if (req.url.includes('/authn/')) {
    return next(authReq);
  }

  if (isTokenExpiringSoon(token) && !isTokenExpired(token)) {
    return getRefresh$(authService).pipe(
      switchMap(() => {
        const freshToken = authService.getToken() ?? token;
        const refreshedReq = req.clone({
          setHeaders: { Authorization: `Bearer ${freshToken}` },
        });
        return next(refreshedReq);
      }),
      redirectWhenTokenExpired(authService, hardRedirect),
    );
  }

  return next(authReq).pipe(redirectWhenTokenExpired(authService, hardRedirect));
};

/**
 * Redirige al login solo si el 401 trae un token vencido localmente: purga el token
 * y recarga duro a `/iniciar-sesion?expired=true` con la ruta actual en `returnUrl`,
 * para que el login devuelva al usuario donde estaba tras reautenticarse. Otro 401
 * se propaga sin redirigir, para no patear desde páginas públicas ni por un 401 de
 * autorización puntual.
 */
function redirectWhenTokenExpired<T>(
  authService: AuthService,
  hardRedirect: HardRedirectService,
): OperatorFunction<T, T> {
  return catchError((error: { status?: number }) => {
    const token = authService.getToken();
    if (error.status === 401 && token && isTokenExpired(token)) {
      authService.removeToken();
      const returnUrl = encodeURIComponent(hardRedirect.getCurrentRoute());
      hardRedirect.redirect(`/iniciar-sesion?expired=true&returnUrl=${returnUrl}`);
    }
    return throwError(() => error);
  });
}

/**
 * Obtiene o crea el Observable compartido del refresh en curso. shareReplay(1)
 * para que varias peticiones concurrentes compartan la misma llamada.
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

/** True si al `exp` del JWT le faltan menos de REFRESH_THRESHOLD_SECONDS. */
function isTokenExpiringSoon(token: string): boolean {
  const exp = tokenExp(token);
  if (exp === null) return false;
  return (exp - Math.floor(Date.now() / 1000)) < REFRESH_THRESHOLD_SECONDS;
}

/** True si el `exp` del JWT ya pasó. Token ilegible o sin `exp` → false (no redirige). */
function isTokenExpired(token: string): boolean {
  const exp = tokenExp(token);
  if (exp === null) return false;
  return exp <= Math.floor(Date.now() / 1000);
}

/** Lee el claim `exp` (epoch en segundos) del JWT, o null si no se puede decodificar. */
function tokenExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}
