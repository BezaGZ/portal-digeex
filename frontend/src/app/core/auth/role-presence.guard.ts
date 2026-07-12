import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthService } from './auth.service';
import { HardRedirectService } from '../navigation/hard-redirect.service';
import { RoleAuthorizationService } from './role-authorization.service';

/**
 * Reja de entrada a `/administrador`: resuelve el rol contra el backend nativo
 * (`RoleAuthorizationService`, features de Site). Sin rol es un huérfano (su
 * grupo fue eliminado, p. ej. al borrar su subdirección): cierra sesión y rebota
 * a `/iniciar-sesion?error=sin-rol`, la misma UX que ya maneja el login.
 *
 * Es confiable porque pega fresco al backend en cada navegación (no depende del
 * stream cacheado con `shareReplay` que dejaba pasar al huérfano por un race), y
 * cubre tanto el login como la entrada por URL directa. Va junto al `authGuard`.
 */
export function rolePresenceGuard(): CanActivateFn {
  return () => {
    const roleAuthz = inject(RoleAuthorizationService);
    const auth = inject(AuthService);
    const hardRedirect = inject(HardRedirectService);

    return roleAuthz.resolveRole$().pipe(
      map((role) => {
        if (role !== null) {
          return true;
        }
        auth.logout().subscribe({
          next: () => hardRedirect.redirect('/iniciar-sesion?error=sin-rol'),
          error: () => hardRedirect.redirect('/iniciar-sesion?error=sin-rol'),
        });
        return false;
      }),
    );
  };
}
