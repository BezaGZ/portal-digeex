import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

/**
 * Centraliza el manejo de errores HTTP: redirige a /login en 401, toast
 * generico en 500, log en consola para el resto. El 403 lo maneja cada
 * componente para evitar toasts duplicados (caso password incorrecto).
 * Las rutas /authn/* se excluyen: cada vista gestiona su propio error.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const messageService = inject(MessageService);

  if (req.url.includes('/authn/')) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      console.error('[HTTP Error]', error);

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
