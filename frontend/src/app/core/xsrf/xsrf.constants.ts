/**
 * Nombres de los headers y cookies que usa el CSRF de DSpace. Se mantienen
 * iguales a los de dspace-angular para que cualquiera del ecosistema los
 * reconozca de inmediato.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/csrf-tokens.md
 */

/** Header que el cliente ENVIA en peticiones mutantes. Estandar de Angular. */
export const XSRF_REQUEST_HEADER = 'X-XSRF-TOKEN';

/** Header que el backend DEVUELVE cuando rota el token (login/logout/refresh). */
export const XSRF_RESPONSE_HEADER = 'DSPACE-XSRF-TOKEN';

/** Cookie client-side donde se guarda el token entre peticiones (default de Angular). */
export const XSRF_COOKIE = 'XSRF-TOKEN';

/**
 * Cookie server-side que el backend usa para validar el token. Llega con
 * HttpOnly, por lo que el cliente NO la lee; el navegador la reenvia sola.
 * Se documenta para dejar claro por que no se accede desde JS.
 */
export const DSPACE_XSRF_COOKIE = 'DSPACE-XSRF-COOKIE';
