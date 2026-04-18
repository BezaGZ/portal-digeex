import { inject } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { switchMap, tap } from 'rxjs';

/**
 * Token CSRF almacenado en memoria.
 *
 * Se actualiza desde el header DSPACE-XSRF-TOKEN de cualquier
 * respuesta del backend, o al llamar GET /api/security/csrf.
 */
let csrfToken: string | null = null;

/**
 * Interceptor HTTP para protección CSRF.
 *
 * DSpace requiere el header X-XSRF-TOKEN en operaciones mutantes
 * (POST, PUT, PATCH, DELETE). El token se obtiene de tres fuentes
 * en orden de prioridad:
 *
 * 1. Memoria (variable csrfToken guardada de respuestas anteriores)
 * 2. Cookie DSPACE-XSRF-COOKIE
 * 3. GET /api/security/csrf (si no hay token por ningún lado)
 *
 * Además, en cada respuesta del backend se extrae el header
 * DSPACE-XSRF-TOKEN para mantener el token actualizado.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/csrf-tokens.md
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const requiresToken = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  if (!requiresToken) {
    return next(req).pipe(
      tap((event) => extractCsrfFromResponse(event)),
    );
  }

  const token = csrfToken ?? getCookie('DSPACE-XSRF-COOKIE');

  if (token) {
    return sendWithToken(req, next, token);
  }

  /**
   * No hay token disponible. Llamamos GET /api/security/csrf
   * para obtener uno antes de continuar con la petición original.
   */
  const http = inject(HttpClient);

  return http.get('/server/api/security/csrf', { observe: 'response' }).pipe(
    switchMap((csrfResponse) => {
      const newToken = csrfResponse.headers.get('DSPACE-XSRF-TOKEN')
        ?? getCookie('DSPACE-XSRF-COOKIE');

      if (newToken) {
        csrfToken = newToken;
      }

      return sendWithToken(req, next, csrfToken);
    }),
  );
};

/**
 * Clona la petición adjuntando el header X-XSRF-TOKEN
 * y extrae el token actualizado de la respuesta.
 */
function sendWithToken(
  req: Parameters<HttpInterceptorFn>[0],
  next: Parameters<HttpInterceptorFn>[1],
  token: string | null,
) {
  const clonedReq = token
    ? req.clone({ setHeaders: { 'X-XSRF-TOKEN': token } })
    : req;

  return next(clonedReq).pipe(
    tap((event) => extractCsrfFromResponse(event)),
  );
}

/**
 * Extrae el token CSRF del header DSPACE-XSRF-TOKEN
 * de la respuesta y lo guarda en memoria.
 */
function extractCsrfFromResponse(event: unknown): void {
  if (
    event &&
    typeof event === 'object' &&
    'headers' in event &&
    typeof (event as { headers: { get: (name: string) => string | null } }).headers?.get === 'function'
  ) {
    const response = event as { headers: { get: (name: string) => string | null } };
    const newToken = response.headers.get('DSPACE-XSRF-TOKEN');
    if (newToken) {
      csrfToken = newToken;
    }
  }
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
