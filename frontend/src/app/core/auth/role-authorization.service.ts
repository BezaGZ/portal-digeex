import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthorizationApiService } from '../api/authorization-api.service';
import { UserRole } from './user-role.model';
import { mapFeaturesToRole } from './role-features';

/**
 * Resuelve el rol del portal preguntando al backend nativo por las cuatro
 * features de Site, en vez de deducirlo del nombre de los grupos. Frío a
 * propósito: cada suscripción consulta fresco (los guards necesitan la
 * respuesta actual, no una cacheada); la caché de identidad vive en el Caller.
 */
@Injectable({ providedIn: 'root' })
export class RoleAuthorizationService {
  private readonly authz = inject(AuthorizationApiService);

  /** Rol afirmado por el backend; null cuando ninguna feature responde (huérfano). */
  resolveRole$(): Observable<UserRole | null> {
    return forkJoin({
      administratorOf: this.authz.isAuthorized('administratorOf'),
      isCommunityAdmin: this.authz.isAuthorized('isCommunityAdmin'),
      isCollectionAdmin: this.authz.isAuthorized('isCollectionAdmin'),
      canSubmit: this.authz.isAuthorized('canSubmit'),
    }).pipe(map(mapFeaturesToRole));
  }
}
