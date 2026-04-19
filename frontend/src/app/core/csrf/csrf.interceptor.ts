import { inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { catchError, switchMap, tap, throwError } from 'rxjs';

/**
 * Header que DSpace envía en cada respuesta con el token CSRF actualizado.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/csrf-tokens.md
 */
const XSRF_RESPONSE_HEADER = 'DSPACE-XSRF-TOKEN';

/**
 * Header que Angular envía al backend con el token CSRF
 * en operaciones mutantes (POST, PUT, PATCH, DELETE).
 */
const XSRF_REQUEST_HEADER = 'X-XSRF-TOKEN';

/**
 * Cookie client-side donde se almacena el token CSRF entre peticiones.
 * No confundir con DSPACE-XSRF-COOKIE (server-side, HttpOnly).
 */
const XSRF_COOKIE = 'XSRF-TOKEN';

/**
 * Cookie server-side que DSpace usa para validar el CSRF.
 * El navegador la envía automáticamente con withCredentials: true.
 * En desarrollo (a través del proxy) puede ser legible por JS;
 * en producción suele ser HttpOnly.
 */
const DSPACE_XSRF_COOKIE = 'DSPACE-XSRF-COOKIE';

/**
 * Token CSRF almacenado en memoria como última fuente disponible.
 *
 * Se actualiza desde el header DSPACE-XSRF-TOKEN de cualquier
 * respuesta del backend (éxito o error).
 */
let csrfToken: string | null = null;

/**
 * Interceptor HTTP para protección CSRF contra DSpace 9.2.
 *
 * Combina el patrón oficial de dspace-angular con un fallback
 * a GET /api/security/csrf para obtener el token inicial.
 *
 * Flujo de obtención del token (en orden de prioridad):
 *
 * 1. Memoria (variable csrfToken, actualizada en cada respuesta)
 * 2. Cookie client-side XSRF-TOKEN (guardada por saveXsrfToken)
 * 3. Cookie DSPACE-XSRF-COOKIE (legible en desarrollo vía proxy)
 * 4. GET /api/security/csrf (fallback si no hay token por ningún lado)
 *
 * En cada respuesta (éxito o error) extrae el header
 * DSPACE-XSRF-TOKEN y lo guarda en memoria y en cookie.
 *
 * Todas las peticiones llevan withCredentials: true para que
 * el navegador envíe la cookie server-side DSPACE-XSRF-COOKIE.
 *
 * @see https://github.com/DSpace/dspace-angular/blob/main/src/app/core/xsrf/xsrf.interceptor.ts
 * @see https://github.com/DSpace/RestContract/blob/main/csrf-tokens.md
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  /**
   * withCredentials: true en TODAS las peticiones para que el
   * navegador envíe y reciba la cookie server-side DSPACE-XSRF-COOKIE.
   */
  req = req.clone({ withCredentials: true });

  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  if (!isMutating) {
    return next(req).pipe(
      tap((event) => extractTokenFromResponse(event)),
      catchError((error: unknown) => {
        extractTokenFromError(error);
        return throwError(() => error);
      }),
    );
  }

  const token = csrfToken
    ?? getCookie(XSRF_COOKIE)
    ?? getCookie(DSPACE_XSRF_COOKIE);

  if (token) {
    return sendWithToken(req, next, token);
  }

  /**
   * No hay token disponible por ninguna fuente.
   * Llamamos GET /api/security/csrf para obtener uno antes
   * de continuar con la petición original.
   */
  const http = inject(HttpClient);

  return http.get('/server/api/security/csrf', { observe: 'response' }).pipe(
    switchMap((csrfResponse) => {
      const freshToken = csrfResponse.headers.get(XSRF_RESPONSE_HEADER)
        ?? getCookie(XSRF_COOKIE)
        ?? getCookie(DSPACE_XSRF_COOKIE);

      if (freshToken) {
        csrfToken = freshToken;
        saveXsrfToken(freshToken);
      }

      return sendWithToken(req, next, csrfToken);
    }),
  );
};

/**
 * Clona la petición adjuntando el header X-XSRF-TOKEN
 * y extrae el token actualizado de la respuesta (éxito o error).
 */
function sendWithToken(
  req: Parameters<HttpInterceptorFn>[0],
  next: Parameters<HttpInterceptorFn>[1],
  token: string | null,
) {
  const clonedReq = token
    ? req.clone({ headers: req.headers.set(XSRF_REQUEST_HEADER, token) })
    : req;

  return next(clonedReq).pipe(
    tap((event) => extractTokenFromResponse(event)),
    catchError((error: unknown) => {
      extractTokenFromError(error);
      return throwError(() => error);
    }),
  );
}

/**
 * Extrae el token CSRF del header DSPACE-XSRF-TOKEN
 * de una respuesta exitosa y lo guarda en memoria y cookie.
 */
function extractTokenFromResponse(event: unknown): void {
  if (event instanceof HttpResponse && event.headers.has(XSRF_RESPONSE_HEADER)) {
    const newToken = event.headers.get(XSRF_RESPONSE_HEADER)!;
    csrfToken = newToken;
    saveXsrfToken(newToken);
  }
}

/**
 * Extrae el token CSRF del header DSPACE-XSRF-TOKEN
 * de una respuesta con error y lo guarda en memoria y cookie.
 *
 * Esto es crucial para el flujo de logout: DSpace envía un
 * token nuevo incluso en respuestas 401/403.
 */
function extractTokenFromError(error: unknown): void {
  if (error instanceof HttpErrorResponse && error.headers.has(XSRF_RESPONSE_HEADER)) {
    const newToken = error.headers.get(XSRF_RESPONSE_HEADER)!;
    csrfToken = newToken;
    saveXsrfToken(newToken);
  }
}

/**
 * Limpia el token CSRF en memoria y la cookie client-side.
 *
 * Debe llamarse después de cerrar sesión para que la próxima
 * petición mutante caiga al fallback GET /api/security/csrf
 * y obtenga un token fresco de una sesión nueva.
 *
 * En producción (sin proxy) esto no sería necesario porque
 * el header DSPACE-XSRF-TOKEN de la respuesta del logout
 * actualiza el token automáticamente. Pero en desarrollo,
 * el proxy de Angular no reenvía headers custom, así que
 * extractTokenFromResponse nunca recibe el token nuevo.
 */
export function resetCsrfToken(): void {
  csrfToken = null;
  document.cookie = `${XSRF_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

/**
 * Guarda el token CSRF en la cookie client-side XSRF-TOKEN.
 *
 * Reemplaza el valor anterior para mantener sincronía con el backend.
 */
function saveXsrfToken(token: string): void {
  document.cookie = `${XSRF_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  document.cookie = `${XSRF_COOKIE}=${encodeURIComponent(token)}; path=/`;
}

/**
 * Extrae el valor de una cookie por nombre.
 */
function getCookie(name: string): string | null {
  const matches = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')}=([^;]*)`)
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}
