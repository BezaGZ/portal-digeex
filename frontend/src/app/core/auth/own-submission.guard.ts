import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

import { AuthService } from './auth.service';
import { CallerProvider } from './caller-provider';
import { ItemApiService } from '../api/item-api.service';

/**
 * Factory de `CanActivateFn` que confina al `personal_delegado` a editar solo
 * los items que él subió: compara el submitter del item (dato del backend) con
 * el uuid del usuario logueado. `superadmin` y `admin_subdireccion` pasan sin
 * chequeo —editan lo de su scope (RN-18)—; solo el delegado se restringe.
 *
 * Cierra la entrada por URL directa a un item ajeno de su misma sub. Es reja de
 * UI, no frontera: en Final 1 el backend igual se lo permitiría por terminal
 * (esa frontera sería el consumer). Se encadena último, tras `roleGuard` +
 * `featureGuard`, que ya garantizan sesión, rol STAFF y feature autorizada.
 */
export function ownSubmissionGuard(paramName = 'uuid'): CanActivateFn {
  return (route) => {
    const auth = inject(AuthService);
    const caller = inject(CallerProvider);
    const itemApi = inject(ItemApiService);
    const router = inject(Router);
    const message = inject(MessageService);

    return caller.currentCaller$.pipe(
      take(1),
      switchMap((current) => {
        // Solo el delegado se confina a lo suyo; los demás roles pasan.
        if (!current || current.role !== 'personal_delegado') {
          return of(true);
        }
        const itemUuid = route.paramMap.get(paramName) ?? '';
        const myUuid = auth.currentUser()?.uuid ?? null;
        return itemApi.getSubmitter(itemUuid).pipe(
          map((submitterUuid) => {
            if (myUuid && submitterUuid === myUuid) {
              return true;
            }
            message.add({
              severity: 'warn',
              summary: 'OUT_OF_SCOPE',
              detail: 'Solo puedes editar tus propios envíos.',
            });
            return router.createUrlTree(['/administrador/envios']);
          }),
        );
      }),
    );
  };
}
