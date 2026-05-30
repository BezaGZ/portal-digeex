import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { BundleApiService } from '../../../../core/api/bundle-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Collection, CollectionCreateBody } from '../../../../core/api/models/collection.model';
import { Bitstream } from '../../../../core/api/models/bitstream.model';
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
  private readonly bundleApi = inject(BundleApiService);
  private readonly scope = inject(ContentScopeService);
  private readonly authCaller = inject(AuthCallerService);

  /**
   * Crea una colección bajo la subcomunidad indicada y enlaza el SUBMITTERS
   * compartido al _SUBMIT y al _admin técnicos. Si `coverFile` viene, el
   * logo se sube como paso final y un fallo dispara rollback completo.
   */
  createColeccion$(
    parentCommunityUuid: string,
    body: CollectionCreateBody,
    sufijoSubdireccion: string,
    coverFile?: File,
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
                catchError((err) => this.rollback$(collection.uuid, null, null, err)),
                switchMap((techSubmit) =>
                  this.groupApi.getByName(`SUBMITTERS_${sufijoSubdireccion}`).pipe(
                    catchError((err) => this.rollback$(collection.uuid, techSubmit.uuid, null, err)),
                    switchMap((shared) => {
                      const sharedUri = buildAbsoluteApiUrl(
                        `${GROUPS_COLLECTION_PATH}/${shared.uuid}`,
                      );
                      /**
                       * El SUBMITTERS_<sufijo> se enlaza dos veces sobre la misma
                       * colección: como subgroup del _SUBMIT técnico (da SUBMIT a
                       * los delegados) y como subgroup del _admin técnico (les da
                       * ADMIN heredado, necesario para POST bundles del cover y
                       * PATCH metadata del item post-archive). Mismo patrón que
                       * setup-dspace.sh Ciclo 40.
                       */
                      return this.groupApi
                        .addSubgroup(techSubmit.uuid, sharedUri)
                        .pipe(
                          catchError((err) =>
                            this.rollback$(collection.uuid, techSubmit.uuid, null, err),
                          ),
                          switchMap(() =>
                            this.collectionApi
                              .createAdminGroup(collection.uuid, {
                                metadata: this.descriptionMetadata(
                                  `adminGroup técnico de ${body.name}`,
                                ),
                              })
                              .pipe(
                                catchError((err) =>
                                  this.rollback$(collection.uuid, techSubmit.uuid, null, err),
                                ),
                                switchMap((techAdmin) =>
                                  this.groupApi
                                    .addSubgroup(techAdmin.uuid, sharedUri)
                                    .pipe(
                                      catchError((err) =>
                                        this.rollback$(
                                          collection.uuid,
                                          techSubmit.uuid,
                                          techAdmin.uuid,
                                          err,
                                        ),
                                      ),
                                      switchMap(() => {
                                        if (!coverFile) {
                                          return of(collection);
                                        }
                                        return this.collectionApi
                                          .uploadLogo(collection.uuid, coverFile)
                                          .pipe(
                                            catchError((err) =>
                                              this.rollback$(
                                                collection.uuid,
                                                techSubmit.uuid,
                                                techAdmin.uuid,
                                                err,
                                              ),
                                            ),
                                            map(() => collection),
                                          );
                                      }),
                                    ),
                                ),
                              ),
                          ),
                        );
                    }),
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

  /**
   * Reemplaza la portada del programa. Si ya existe logo, el DELETE va antes
   * del POST porque DSpace 9 tira 422 al hacer POST sobre logo existente.
   */
  replaceLogo$(
    collectionUuid: string,
    file: File,
    sufijoSubdireccion: string,
  ): Observable<Bitstream> {
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
        return this.collectionApi.getLogo(collectionUuid).pipe(
          switchMap((existing) => {
            const delete$ = existing
              ? this.bundleApi.deleteBitstream(existing.uuid)
              : of(null as unknown);
            return delete$.pipe(
              switchMap(() => this.collectionApi.uploadLogo(collectionUuid, file)),
            );
          }),
        );
      }),
    );
  }

  /**
   * Cascada inversa: lo último creado se borra primero. El admin técnico
   * se creó después del submit técnico, así que su DELETE va antes.
   */
  private rollback$(
    collectionUuid: string | null,
    techSubmittersUuid: string | null,
    techAdminUuid: string | null,
    originalError: unknown,
  ): Observable<never> {
    const cleanup$: Observable<unknown>[] = [];
    if (techAdminUuid) {
      cleanup$.push(this.groupApi.delete(techAdminUuid));
    }
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
