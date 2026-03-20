import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor HTTP para protección CSRF.
 *
 * Lee el token CSRF desde la cookie `DSPACE-XSRF-COOKIE` que establece DSpace
 * y lo adjunta como header `X-XSRF-TOKEN` en todas las operaciones mutantes
 * (POST, PUT, PATCH, DELETE).
 *
 * Las operaciones de solo lectura (GET, HEAD, OPTIONS) no requieren el token.
 *
 * @see {@link https://wiki.lyrasis.org/display/DSDOC9x/REST+API DSpace REST API}
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  // Solo adjuntar token en operaciones mutantes
  const requiresToken = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  if (!requiresToken) {
    return next(req);
  }

  // Leer token desde cookie
  const token = getCookie('DSPACE-XSRF-COOKIE');

  if (!token) {
    return next(req);
  }

  // Clonar request y adjuntar header
  const clonedReq = req.clone({
    setHeaders: {
      'X-XSRF-TOKEN': token
    }
  });

  return next(clonedReq);
};

/**
 * Extrae el valor de una cookie por nombre.
 *
 * @param name Nombre de la cookie
 * @returns Valor de la cookie o null si no existe
 */
function getCookie(name: string): string | null {
  const matches = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')}=([^;]*)`)
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}
