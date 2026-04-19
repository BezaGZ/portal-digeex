import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor HTTP para manejo centralizado de errores.
 *
 * Captura errores HTTP y proporciona feedback consistente al usuario:
 * - 401 Unauthorized: Redirige a login
 * - 403 Forbidden: Muestra toast de acceso denegado
 * - 500 Server Error: Muestra toast de error del servidor
 * - Otros errores: Los registra en consola
 *
 * Todos los errores se registran en la consola del navegador para debugging.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const messageService = inject(MessageService);

  /**
   * Las rutas de autenticación (/authn/login, /authn/logout, /authn/status)
   * manejan sus propios errores en cada componente. Evitamos toasts
   * duplicados o redirecciones innecesarias desde el interceptor global.
   */
  if (req.url.includes('/authn/')) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      console.error('[HTTP Error]', error);

      // Manejar errores según código de estado
      switch (error.status) {
        case 401:
          // No autorizado - redirigir a login
          router.navigate(['/login']);
          break;

        case 403:
          // Acceso denegado - mostrar toast
          messageService.add({
            severity: 'error',
            summary: 'Acceso Denegado',
            detail: 'No tienes permisos para realizar esta acción'
          });
          break;

        case 500:
          // Error del servidor - mostrar toast
          messageService.add({
            severity: 'error',
            summary: 'Error del Servidor',
            detail: 'Ocurrió un error en el servidor. Por favor, intenta de nuevo.'
          });
          break;

        default:
          // Otros errores - ya están registrados en consola
          break;
      }

      // Propagar el error
      return throwError(() => error);
    })
  );
};
