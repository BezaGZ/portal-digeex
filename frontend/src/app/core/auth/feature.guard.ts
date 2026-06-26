import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { map } from 'rxjs/operators';

import { AuthorizationApiService } from '../api/authorization-api.service';
import { buildBackendApiUrl } from '../api/dspace-rest.util';
import { FeatureId } from '../api/models/feature-id';
import { rejectAccess } from './access-rejection';

/**
 * Factory de `CanActivateFn` parametrizado por una feature de DSpace y el path
 * del tipo de objeto. Lee el uuid de la ruta, arma el self absoluto del objeto
 * y le pregunta al backend nativo (`isAuthorized`) si el usuario del token puede
 * ejercer la feature: deja pasar en `true`, redirige a `/administrador` con toast
 * de acceso restringido en `false`. Se encadena tras `authGuard`, que ya garantiza
 * sesión. Reemplaza la heurística del sufijo en las rutas `:uuid` y cierra la
 * entrada por URL directa a un recurso de otra subdirección (sección 2.6).
 */
export function featureGuard(
  feature: FeatureId,
  objectBasePath: string,
  paramName = 'uuid',
): CanActivateFn {
  return (route) => {
    const authz = inject(AuthorizationApiService);
    const router = inject(Router);
    const message = inject(MessageService);

    const uuid = route.paramMap.get(paramName);
    const objectUrl = buildBackendApiUrl(`${objectBasePath}/${uuid}`);

    return authz.isAuthorized(feature, objectUrl).pipe(
      map((allowed) => {
        if (allowed) {
          return true;
        }
        return rejectAccess(message, router, 'No tienes acceso a este recurso.', '/administrador');
      }),
    );
  };
}
