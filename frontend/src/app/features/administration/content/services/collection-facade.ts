import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Collection, CollectionCreateBody } from '../../../../core/api/models/collection.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';
import {
  GROUPS_COLLECTION_PATH,
  buildAbsoluteApiUrl,
} from '../../../../core/api/dspace-rest.util';
import { resolveCaller$, rollbackCascade } from './facade-utils';

/**
 * Coordina create/update/delete de colecciones bajo una subdirección. Cada
 * operación valida el scope del caller antes de tocar el backend, ejecuta
 * los pasos del pipeline en orden y, si algún paso intermedio falla,
 * deshace lo creado en cascada inversa. El SUBMITTERS_<sufijo> es por
 * subdirección y compartido; el facade lo busca por nombre y solo lo
 * enlaza como subgrupo del submittersGroup técnico de la nueva colección.
 */
@Injectable({ providedIn: 'root' })
export class CollectionFacade {
  private readonly collectionApi = inject(CollectionApiService);
  private readonly groupApi = inject(GroupApiService);
  private readonly scope = inject(ContentScopeService);
  private readonly authCaller = inject(AuthCallerService);

  /**
   * Crea una colección bajo la subcomunidad indicada. Pipeline: POST
   * collection → POST submittersGroup técnico → GET SUBMITTERS_<sufijo>
   * compartido → POST subgroups link.
   */
  createColeccion$(
    parentCommunityUuid: string,
    body: CollectionCreateBody,
    sufijoSubdireccion: string,
  ): Observable<Collection> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'collection',
            resourceSufijo: sufijoSubdireccion,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.collectionApi.create(parentCommunityUuid, body).pipe(
          switchMap((collection) =>
            this.collectionApi
              .createSubmittersGroup(collection.uuid, {
                metadata: this.descriptionMetadata(`submittersGroup técnico de ${body.name}`),
              })
              .pipe(
                catchError((err) => this.rollback$(collection.uuid, null, err)),
                switchMap((tech) =>
                  this.groupApi.getByName(`SUBMITTERS_${sufijoSubdireccion}`).pipe(
                    catchError((err) => this.rollback$(collection.uuid, tech.uuid, err)),
                    switchMap((shared) =>
                      this.groupApi
                        .addSubgroup(
                          tech.uuid,
                          buildAbsoluteApiUrl(`${GROUPS_COLLECTION_PATH}/${shared.uuid}`),
                        )
                        .pipe(
                          catchError((err) => this.rollback$(collection.uuid, tech.uuid, err)),
                          map(() => collection),
                        ),
                    ),
                  ),
                ),
              ),
          ),
        );
      }),
    );
  }

  /**
   * Edita metadata de una colección. SuperAdmin sobre cualquiera o
   * admin_subdireccion sobre las que cuelguen de su sub-community
   * (matching sufijo).
   */
  updateColeccion$(
    uuid: string,
    patch: JsonPatchEntry[],
    sufijoSubdireccion: string,
  ): Observable<Collection> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'collection',
            resourceSufijo: sufijoSubdireccion,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.collectionApi.updateMetadata(uuid, patch);
      }),
    );
  }

  /**
   * Elimina una colección. DSpace cascadea el submittersGroup técnico
   * asociado; el SUBMITTERS_<sufijo> compartido por la subdirección queda
   * intacto porque sirve a las demás colecciones hermanas.
   */
  deleteColeccion$(uuid: string, sufijoSubdireccion: string): Observable<void> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'collection',
            resourceSufijo: sufijoSubdireccion,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.collectionApi.delete(uuid);
      }),
    );
  }

  private rollback$(
    collectionUuid: string | null,
    techSubmittersUuid: string | null,
    originalError: unknown,
  ): Observable<never> {
    const cleanup$: Observable<unknown>[] = [];
    if (techSubmittersUuid) {
      cleanup$.push(this.groupApi.delete(techSubmittersUuid));
    }
    if (collectionUuid) {
      cleanup$.push(this.collectionApi.delete(collectionUuid));
    }
    return rollbackCascade(cleanup$, originalError);
  }

  private descriptionMetadata(value: string) {
    return {
      'dc.description': [
        { value, language: null, authority: null, confidence: -1, place: 0 },
      ],
    };
  }
}
