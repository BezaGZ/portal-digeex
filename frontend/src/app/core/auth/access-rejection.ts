import { Router, UrlTree } from '@angular/router';
import { MessageService } from 'primeng/api';

/** Título del aviso que ve el usuario cuando un guard le niega una ruta. */
const ACCESS_DENIED_SUMMARY = 'Acceso restringido';

/**
 * Rechazo uniforme de los guards de ruta: muestra el aviso al usuario y devuelve
 * el UrlTree de redirección. Centraliza la severidad y el título del toast para
 * que cada guard solo aporte el detalle y el destino.
 */
export function rejectAccess(
  message: MessageService,
  router: Router,
  detail: string,
  redirectTo: string,
): UrlTree {
  message.add({ severity: 'warn', summary: ACCESS_DENIED_SUMMARY, detail });
  return router.createUrlTree([redirectTo]);
}
