import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpXsrfTokenExtractor } from '@angular/common/http';
import { OperatorFunction, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { HardRedirectService } from '../navigation/hard-redirect.service';
import { isTokenExpired, tokenExp } from './token-expiry.util';
import { SKIP_BEARER } from './skip-bearer.context';
import { XSRF_REQUEST_HEADER } from '../xsrf/xsrf.constants';

/** Umbral en segundos para disparar refresh anticipado (5 minutos). */
const REFRESH_THRESHOLD_SECONDS = 300;

/**
 * Adjunta el JWT y refresca anticipadamente. Ante un 401 redirige al login solo si
 * el token venció localmente; con token válido propaga sin redirigir (no atrapa lo
 * público). `/authn/*` recibe Bearer pero salta refresh y redirect (sin recursión),
 * salvo las peticiones marcadas con `SKIP_BEARER` (login con credenciales).
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const hardRedirect = inject(HardRedirectService);
  const xsrfExtractor = inject(HttpXsrfTokenExtractor);
  const token = authService.getToken();

  // Petición que renuncia al Bearer (login con credenciales): con el token
  // adjunto DSpace trataría el POST como refresh de la sesión vieja.
  if (req.context.get(SKIP_BEARER)) {
    return next(req);
  }

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
    return authService.refreshToken().pipe(
      switchMap(() => {
        const freshToken = authService.getToken() ?? token;
        const setHeaders: Record<string, string> = { Authorization: `Bearer ${freshToken}` };
        // DSpace rota el token XSRF en el refresh (login), así que un reintento de
        // mutación con el X-XSRF-TOKEN previo daría 403; se reaplica el vigente.
        const freshXsrf = xsrfExtractor.getToken();
        if (freshXsrf && req.headers.has(XSRF_REQUEST_HEADER)) {
          setHeaders[XSRF_REQUEST_HEADER] = freshXsrf;
        }
        return next(req.clone({ setHeaders }));
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

/** True si al `exp` del JWT le faltan menos de REFRESH_THRESHOLD_SECONDS. */
function isTokenExpiringSoon(token: string): boolean {
  const exp = tokenExp(token);
  if (exp === null) return false;
  return (exp - Math.floor(Date.now() / 1000)) < REFRESH_THRESHOLD_SECONDS;
}
