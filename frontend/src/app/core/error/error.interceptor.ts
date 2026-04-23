import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Centraliza el manejo de errores HTTP: redirige a /login en 401, toast
 * generico en 500, log en consola para el resto. El 403 lo maneja cada
 * componente para evitar toasts duplicados (caso password incorrecto).
 * Las rutas /authn/* se excluyen: cada vista gestiona su propio error.
 *
 * El log en consola se limita a status + url para no filtrar bodies con
 * datos sensibles (p. ej. `current_password` en un PATCH fallido). El
 * objeto completo solo sale por `console.debug` en dev para debugging.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
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

      switch (error.status) {
        case 401:
          router.navigate(['/login']);
          break;

        case 500:
          messageService.add({
            severity: 'error',
            summary: 'Error del Servidor',
            detail: 'Ocurrió un error en el servidor. Por favor, intenta de nuevo.'
          });
          break;

        default:
          break;
      }

      return throwError(() => error);
    })
  );
};
