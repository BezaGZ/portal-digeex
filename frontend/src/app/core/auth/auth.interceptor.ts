import { inject } from '@angular/core';
import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
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
 * Interceptor que adjunta el JWT en el header Authorization, dispara refresh
 * automático cuando el token está próximo a expirar, captura la rotación del
 * JWT que DSpace devuelve en cada response autenticada, y redirige al login
 * si DSpace responde 401.
 *
 * Las peticiones a `/authn/*` (login, status, logout, refresh) siguen
 * recibiendo el Bearer y la captura de rotación, pero no disparan la rama
 * de refresh ni el `redirectOn401`. Esto evita dos bugs: la recursión
 * cuando el POST del refresh entra al interceptor y dispararía otro refresh
 * sobre sí mismo, y el doble navigate a /login cuando un 401 del refresh
 * propaga también al wrapper externo. El AuthService dueño de esas llamadas
 * maneja sus propios errores (credenciales en login, refresh fallido en
 * refreshToken, 401 en status durante restoreSession).
 *
 * Sin token, las peticiones pasan sin modificar.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (!token) {
    return next(req);
  }

  // Endpoints anónimos de DSpace 9 que no deben llevar el JWT del caller.
  // `/eperson/registrations` es `permitAll`, pero el filtro de seguridad
  // valida el Bearer antes de llegar al endpoint y rechaza con 401 cuando
  // el token está expirado. La pantalla de reset por token se rompía
  // porque ese 401 cascadeaba en un redirect a `/iniciar-sesion`.
  // `/statistics/viewevents` registra visitas en Solr Statistics: si llega
  // autenticado como admin DSpace filtra el hit para no inflar los reportes
  // con tráfico de administración. Las visitas siempre son anónimas.
  if (req.url.includes('/eperson/registrations') || req.url.includes('/statistics/viewevents')) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  if (req.url.includes('/authn/')) {
    return next(authReq).pipe(captureRotatedJwt(authService));
  }

  if (isTokenExpiringSoon(token)) {
    return getRefresh$(authService).pipe(
      switchMap(() => {
        const freshToken = authService.getToken() ?? token;
        const refreshedReq = req.clone({
          setHeaders: { Authorization: `Bearer ${freshToken}` },
        });
        return next(refreshedReq).pipe(captureRotatedJwt(authService));
      }),
      redirectOn401(router),
    );
  }

  return next(authReq).pipe(captureRotatedJwt(authService), redirectOn401(router));
};

/**
 * DSpace 9.2 rota el JWT en cada response autenticada y lo devuelve en el
 * header `Authorization`. El operador lee ese header cuando llega un
 * `HttpResponse` y delega a `authService.storeRotatedToken`, que es idempotente
 * si el token coincide con el actual.
 */
function captureRotatedJwt<T>(authService: AuthService): OperatorFunction<HttpEvent<T>, HttpEvent<T>> {
  return tap((event) => {
    if (!(event instanceof HttpResponse)) return;
    const header = event.headers.get('Authorization');
    if (header?.startsWith('Bearer ')) {
      authService.storeRotatedToken(header.substring(7));
    }
  });
}

/**
 * Operador que intercepta respuestas 401 (Unauthorized)
 * y redirige al usuario a la pantalla de login.
 */
function redirectOn401<T>(router: Router): OperatorFunction<T, T> {
  return catchError((error: { status?: number }) => {
    if (error.status === 401) {
      router.navigate(['/iniciar-sesion']);
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
