import { HttpErrorResponse, HttpInterceptorFn, HttpResponse, HttpXsrfTokenExtractor } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import Cookies from 'js-cookie';
import { XSRF_COOKIE, XSRF_REQUEST_HEADER, XSRF_RESPONSE_HEADER } from './xsrf.constants';
import { environment } from '../../../environments/environment';

/**
 * Prefijo del REST de DSpace. El proyecto lo consume con URLs relativas
 * same-origin (`/server/api/...`); solo a esas URLs se adjunta el token.
 */
const REST_API_PREFIX = '/server/api';

/**
 * Maneja el token de seguridad (CSRF) que DSpace pide en las operaciones que
 * modifican datos: lo adjunta al crear, editar o borrar, y guarda el token
 * nuevo que el backend devuelve para que siempre viaje el vigente. Sigue el
 * mismo flujo que dspace-angular.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/csrf-tokens.md
 */
export const xsrfInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenExtractor = inject(HttpXsrfTokenExtractor);

  // Con credenciales en toda peticion para que viaje la cookie server-side que
  // el backend usa para validar el token.
  req = req.clone({ withCredentials: true });

  // El contrato no pide token en GET/HEAD; tampoco en URLs ajenas al REST.
  const isMutating = req.method !== 'GET' && req.method !== 'HEAD';
  if (isMutating && req.url.toLowerCase().startsWith(REST_API_PREFIX)) {
    const token = tokenExtractor.getToken();
    // No se pisa un X-XSRF-TOKEN ya puesto a mano por el caller.
    if (token !== null && !req.headers.has(XSRF_REQUEST_HEADER)) {
      req = req.clone({ headers: req.headers.set(XSRF_REQUEST_HEADER, token) });
    }
  }

  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.headers.has(XSRF_RESPONSE_HEADER)) {
        saveXsrfToken(event.headers.get(XSRF_RESPONSE_HEADER)!);
      }
    }),
    catchError((error: unknown) => {
      // DSpace rota el token tambien en errores (p. ej. el 403 por mismatch);
      // se guarda igual para que la siguiente peticion use el token vigente.
      if (error instanceof HttpErrorResponse && error.headers.has(XSRF_RESPONSE_HEADER)) {
        saveXsrfToken(error.headers.get(XSRF_RESPONSE_HEADER)!);
      }
      return throwError(() => error);
    }),
  );
};

/**
 * Copia el token rotado del header DSPACE-XSRF-TOKEN a la cookie cliente
 * XSRF-TOKEN, unica fuente que lee HttpXsrfTokenExtractor en la siguiente
 * peticion. Se reemplaza el valor anterior para mantener sincronia. Los flags
 * sameSite/secure la alinean con la cookie de auth; secure se apaga en dev
 * porque el navegador descarta cookies Secure sobre HTTP local.
 */
function saveXsrfToken(token: string): void {
  Cookies.remove(XSRF_COOKIE, { path: '/' });
  Cookies.set(XSRF_COOKIE, token, {
    path: '/',
    sameSite: 'lax',
    secure: environment.production,
  });
}
