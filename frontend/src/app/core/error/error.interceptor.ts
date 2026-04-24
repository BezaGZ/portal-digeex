import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Centraliza el manejo visible de errores HTTP: toast genérico en 500 y
 * log de status/url para el resto. El 401 lo maneja exclusivamente el
 * `jwtInterceptor` (fuente única de redirección al login). El 403 lo
 * resuelve cada componente para evitar toasts duplicados. Las rutas
 * `/authn/*` se excluyen: cada vista gestiona su propio error.
 *
 * El log en consola se limita a status + url para no filtrar bodies con
 * datos sensibles (p. ej. `current_password` en un PATCH fallido). El
 * objeto completo solo sale por `console.debug` en dev para debugging.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageService);

  if (req.url.includes('/authn/')) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      console.error('[HTTP Error]', error.status, error.url);
      if (!environment.production) {
        // eslint-disable-next-line no-console -- detalle silencioso solo en dev; nunca corre en prod.
        console.debug('[HTTP Error detail]', error);
      }

      if (error.status === 500) {
        messageService.add({
          severity: 'error',
          summary: 'Error del Servidor',
          detail: 'Ocurrió un error en el servidor. Por favor, intenta de nuevo.'
        });
      }

      return throwError(() => error);
    })
  );
};
