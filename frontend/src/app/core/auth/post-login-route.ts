/**
 * Destino tras un login con rol. Acepta solo rutas internas: `/` inicial pero
 * no `//` (open redirect) ni el propio login (loop); lo demás cae al panel.
 */
export function resolvePostLoginRoute(returnUrl: string | null): string {
  const isInternal =
    !!returnUrl &&
    returnUrl.startsWith('/') &&
    !returnUrl.startsWith('//') &&
    !returnUrl.startsWith('/iniciar-sesion');
  return isInternal ? returnUrl : '/administrador';
}
