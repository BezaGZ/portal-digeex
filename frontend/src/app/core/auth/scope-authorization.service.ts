import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { CommunityApiService } from '../api/community-api.service';
import { CollectionApiService } from '../api/collection-api.service';
import { Collection } from '../api/models/collection.model';
import { Community } from '../api/models/community.model';
import { UserRole } from './user-role.model';

/**
 * Resuelve el uuid de la subdirección del caller con los searches autorizados
 * del backend, sin depender de nombres de grupo ni del metadato de sufijo.
 * Superadmin resuelve null: opera global y elige subdirección libremente.
 */
@Injectable({ providedIn: 'root' })
export class ScopeAuthorizationService {
  private readonly communityApi = inject(CommunityApiService);
  private readonly collectionApi = inject(CollectionApiService);

  /** Uuid de la sub del caller; null para superadmin, sin rol, o sin scope resoluble (fail-closed). */
  resolveScopeUuid$(role: UserRole | null): Observable<string | null> {
    if (role === 'admin_subdireccion') {
      return this.communityApi.searchAdminAuthorized(0, 1).pipe(
        map((resp) => {
          const embedded = (resp._embedded ?? {}) as Record<string, Community[] | undefined>;
          return embedded['communities']?.[0]?.uuid ?? null;
        }),
      );
    }
    if (role === 'personal_delegado') {
      return this.collectionApi.searchSubmitAuthorized(0, 1).pipe(
        switchMap((resp) => {
          const embedded = (resp._embedded ?? {}) as Record<string, Collection[] | undefined>;
          const firstCollection = embedded['collections']?.[0];
          if (!firstCollection) {
            return of(null);
          }
          return this.collectionApi
            .getParentCommunity(firstCollection.uuid)
            .pipe(map((parent) => parent?.uuid ?? null));
        }),
      );
    }
    return of(null);
  }
}
