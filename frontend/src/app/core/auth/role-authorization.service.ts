import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import { AuthorizationApiService } from '../api/authorization-api.service';
import { AuthService } from './auth.service';
import { UserRole } from './user-role.model';
import { mapFeaturesToRole } from './role-features';

/**
 * Resuelve el rol del portal preguntando al backend nativo por las cuatro
 * features de Site, en vez de deducirlo del nombre de los grupos. La
 * resolución se cachea por el uuid del EPerson autenticado: el guard y la
 * identidad del Caller comparten una sola consulta por sesión, y un cambio
 * de usuario invalida el cache y re-resuelve. Sin sesión resuelve null sin
 * tocar el backend (fail-closed).
 */
@Injectable({ providedIn: 'root' })
export class RoleAuthorizationService {
  private readonly authz = inject(AuthorizationApiService);
  private readonly authService = inject(AuthService);

  /** Uuid del EPerson cuya resolución está cacheada; null si aún no se resolvió. */
  private cachedForEpersonId: string | null = null;
  /** Resolución compartida del EPerson cacheado (`shareReplay` para no duplicar el GET). */
  private cachedRole$: Observable<UserRole | null> | null = null;

  /** Rol afirmado por el backend; null cuando ninguna feature responde (huérfano) o no hay sesión. */
  resolveRole$(): Observable<UserRole | null> {
    const eperson = this.authService.currentEPerson();
    if (!eperson) {
      this.cachedForEpersonId = null;
      this.cachedRole$ = null;
      return of<UserRole | null>(null);
    }
    if (this.cachedForEpersonId !== eperson.uuid || this.cachedRole$ === null) {
      this.cachedForEpersonId = eperson.uuid;
      this.cachedRole$ = forkJoin({
        administratorOf: this.authz.isAuthorized('administratorOf'),
        isCommunityAdmin: this.authz.isAuthorized('isCommunityAdmin'),
        isCollectionAdmin: this.authz.isAuthorized('isCollectionAdmin'),
        canSubmit: this.authz.isAuthorized('canSubmit'),
      }).pipe(
        map(mapFeaturesToRole),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.cachedRole$;
  }
}
