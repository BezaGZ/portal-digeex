import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthorizationApiService } from '../api/authorization-api.service';
import { FeatureId } from '../api/models/feature-id';
import { AuthService } from './auth.service';
import { HardRedirectService } from '../navigation/hard-redirect.service';

/**
 * Features de Site que marcan "tiene rol del portal". Verificado contra el
 * backend: cada rol da SI en al menos una y el huérfano (cuenta sin grupo de
 * rol) da `no` en las cuatro. `canViewUsageStatistics` queda fuera a propósito:
 * la tiene cualquier logueado, incluido el huérfano, así que no distingue rol.
 */
const ROLE_FEATURES: readonly FeatureId[] = [
  'administratorOf',
  'isCommunityAdmin',
  'isCollectionAdmin',
  'canSubmit',
];

/**
 * Reja de entrada a `/administrador`: pregunta al backend nativo (`isAuthorized`
 * sobre el Site — sin `objectUrl` el endpoint asume el Site) si el usuario tiene
 * alguna capacidad del portal. Si no tiene ninguna es un huérfano (su grupo de
 * rol fue eliminado, p. ej. al borrar su subdirección): cierra sesión y rebota a
 * `/iniciar-sesion?error=sin-rol`, la misma UX que ya maneja el login.
 *
 * Es confiable porque pega fresco al backend en cada navegación (no depende del
 * stream cacheado con `shareReplay` que dejaba pasar al huérfano por un race), y
 * cubre tanto el login como la entrada por URL directa. Va junto al `authGuard`.
 */
export function rolePresenceGuard(): CanActivateFn {
  return () => {
    const authz = inject(AuthorizationApiService);
    const auth = inject(AuthService);
    const hardRedirect = inject(HardRedirectService);

    return combineLatest(ROLE_FEATURES.map((feature) => authz.isAuthorized(feature))).pipe(
      map((results) => {
        if (results.some(Boolean)) {
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
