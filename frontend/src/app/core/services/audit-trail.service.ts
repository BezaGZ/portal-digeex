import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

import { ItemApiService } from '../api/item-api.service';
import { CommunityApiService } from '../api/community-api.service';
import { CollectionApiService } from '../api/collection-api.service';
import { JsonPatchEntry, PATCH_OP_ADD } from '../api/json-patch.util';
import { AuthCallerService } from '../../features/administration/shared/services/auth-caller.service';
import { Actor } from '../../features/administration/content/specifications/scope-context.model';

/**
 * DSO sobre el que se appendea la entrada de provenance. El service
 * discrimina internamente el wrapper HTTP a invocar por tipo.
 */
export type AuditDsoType = 'item' | 'community' | 'collection';

/**
 * Formato canónico del mensaje del audit. La concatenación queda como una
 * sola constante para que sumar una acción nueva no requiera tocar la lógica
 * del service.
 */
export const AUDIT_MESSAGE_TEMPLATE = (
  action: string,
  actor: Actor,
  timestamp: Date,
): string =>
  `${action} by ${actor.firstName} ${actor.lastName} (${actor.email}) on ${timestamp.toISOString()}`;

/** Path JSON Patch para appendear al final del array de provenance. */
export const PROVENANCE_APPEND_PATH = '/metadata/dc.description.provenance/-';

/**
 * Service centralizado para agregar entradas de auditoría al campo
 * `dc.description.provenance` de items, communities y collections. Resuelve
 * el actor desde `AuthCallerService.currentActor$`, arma el patch JSON
 * `op: add` y dispatcha al wrapper HTTP correspondiente.
 */
@Injectable({ providedIn: 'root' })
export class AuditTrailService {
  private readonly auth = inject(AuthCallerService);
  private readonly itemApi = inject(ItemApiService);
  private readonly communityApi = inject(CommunityApiService);
  private readonly collectionApi = inject(CollectionApiService);

  /**
   * Append de una entrada al `dc.description.provenance` del DSO indicado.
   * Falla si no hay actor autenticado o si el PATCH del backend rechaza.
   */
  appendProvenance$(
    dsoType: AuditDsoType,
    dsoUuid: string,
    action: string,
  ): Observable<void> {
    return this.auth.currentActor$.pipe(
      take(1),
      switchMap((actor) => {
        if (!actor) {
          return throwError(() => new Error('AuditTrailService: no authenticated actor'));
        }
        const patch: JsonPatchEntry[] = [
          {
            op: PATCH_OP_ADD,
            path: PROVENANCE_APPEND_PATH,
            value: AUDIT_MESSAGE_TEMPLATE(action, actor, new Date()),
          },
        ];
        return this.dispatch(dsoType, dsoUuid, patch).pipe(map(() => undefined));
      }),
    );
  }

  /** Strategy implícito por `dsoType`: cada wrapper expone `updateMetadata` con el mismo contrato. */
  private dispatch(
    dsoType: AuditDsoType,
    dsoUuid: string,
    patch: JsonPatchEntry[],
  ): Observable<unknown> {
    switch (dsoType) {
      case 'item':
        return this.itemApi.updateMetadata(dsoUuid, patch);
      case 'community':
        return this.communityApi.updateMetadata(dsoUuid, patch);
      case 'collection':
        return this.collectionApi.updateMetadata(dsoUuid, patch);
    }
  }
}
