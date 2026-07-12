import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import {
  Community,
  CommunityCreateBody,
  adminGroupUuidOf,
  submittersGroupUuidOf,
} from '../../../../core/api/models/community.model';
import { JsonPatchEntry, addOp } from '../../../../core/api/json-patch.util';
import {
  GROUPS_COLLECTION_PATH,
  buildAbsoluteApiUrl,
} from '../../../../core/api/dspace-rest.util';
import { resolveCaller$, rollbackCascade, withAudit$ } from './facade-utils';
import { AUDIT_ACTIONS, AuditTrailService } from '../provenance/audit-trail.service';

/**
 * Coordina create/update/delete de subdirecciones (sub-comunidades de la
 * raíz del repositorio). Cada operación valida el scope del usuario antes
 * de tocar el backend, ejecuta los pasos del pipeline en orden y, si un
 * paso intermedio falla, deshace los previos en cascada inversa para
 * dejar el sistema en estado consistente.
 */
@Injectable({ providedIn: 'root' })
export class CommunityFacade {
  private readonly communityApi = inject(CommunityApiService);
  private readonly groupApi = inject(GroupApiService);
  private readonly scope = inject(ContentScopeService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly audit = inject(AuditTrailService);

  /**
   * Crea una subdirección bajo la raíz del repositorio. Solo SuperAdmin.
   * Pipeline: POST community → POST adminGroup técnico → POST ADMIN_<sufijo>
   * standalone → POST subgroups (link) → POST SUBMITTERS_<sufijo> standalone.
   * Rollback en cascada inversa si cualquier paso falla.
   */
  createSubdireccion$(body: CommunityCreateBody, sufijo: string): Observable<Community> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'community-toplevel',
            resourceScopeUuid: null,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.communityApi.searchTop(0, 1).pipe(
          map((resp) => resp._embedded?.['communities']?.[0]?.uuid),
          switchMap((rootUuid) => {
            if (!rootUuid) {
              return throwError(
                () =>
                  new BusinessRuleError(
                    'NOT_FOUND',
                    'No se encontró la community raíz del repositorio.',
                  ),
              );
            }
            return this.runCreatePipeline$(rootUuid, body, sufijo).pipe(
              withAudit$<Community>(this.audit, 'community', AUDIT_ACTIONS.CREATED),
            );
          }),
        );
      }),
    );
  }

  /**
   * Crea la comunidad raíz del repositorio (top-level, sin parent). Solo
   * SuperAdmin (lo valida el scope `community-toplevel`). A diferencia de una
   * subdirección, la raíz no lleva grupos `ADMIN_/SUBMITTERS_` ni sufijo: es el
   * contenedor del que cuelga todo. Reemplaza el bloque que creaba la raíz en
   * setup-dspace.sh.
   */
  createRoot$(body: CommunityCreateBody): Observable<Community> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'community-toplevel',
            resourceScopeUuid: null,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.communityApi.create(body);
      }),
    );
  }

  /**
   * Edita metadata de una subdirección. SuperAdmin sobre cualquiera o
   * admin_subdireccion sobre la suya (matching por scope afirmado: el
   * recurso ES la subdirección, su propio uuid es el scope).
   */
  updateSubdireccion$(uuid: string, patch: JsonPatchEntry[]): Observable<Community> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'community-sub',
            resourceScopeUuid: uuid,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.communityApi
          .updateMetadata(uuid, patch)
          .pipe(withAudit$<Community>(this.audit, 'community', AUDIT_ACTIONS.EDITED));
      }),
    );
  }

  /**
   * Elimina una subdirección y los grupos del portal asociados (ADMIN y
   * SUBMITTERS standalone), leyendo sus uuids del metadata de la community.
   * Solo SuperAdmin. Orden: primero los grupos (porque DSpace cascadea el
   * adminGroup técnico al borrar la community, pero los standalone no),
   * después la community.
   */
  deleteSubdireccion$(uuid: string): Observable<void> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'community-sub',
            resourceScopeUuid: uuid,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.communityApi.getOne(uuid).pipe(
          switchMap((community) => {
            const submittersUuid = submittersGroupUuidOf(community);
            const adminUuid = adminGroupUuidOf(community);
            if (!submittersUuid || !adminUuid) {
              // Fail-fast antes de borrar nada: sin los uuids anotados no hay
              // forma confiable de limpiar los grupos (correr el backfill).
              return throwError(
                () =>
                  new BusinessRuleError(
                    'SUBDIRECCION_SIN_MIGRAR',
                    'La subdirección no tiene registrados los uuids de sus grupos. Ejecutar el backfill antes de eliminarla.',
                  ),
              );
            }
            return this.groupApi.delete(submittersUuid).pipe(
              switchMap(() => this.groupApi.delete(adminUuid)),
              switchMap(() => this.communityApi.delete(uuid)),
            );
          }),
        );
      }),
    );
  }

  private runCreatePipeline$(
    rootUuid: string,
    body: CommunityCreateBody,
    sufijo: string,
  ): Observable<Community> {
    const enriched: CommunityCreateBody = {
      ...body,
      metadata: {
        ...body.metadata,
        'digeex.sufijo': [
          { value: sufijo, language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };
    return this.communityApi.create(enriched, rootUuid).pipe(
      switchMap((community) =>
        this.communityApi
          .createAdminGroup(community.uuid, {
            metadata: this.descriptionMetadata(`adminGroup técnico de ${body.name}`),
          })
          .pipe(
          catchError((err) => this.rollback$(community.uuid, null, null, err)),
          switchMap((tech) =>
            this.groupApi
              .create({
                name: `ADMIN_${sufijo}`,
                metadata: this.descriptionMetadata(`Administradores de ${body.name}`),
              })
              .pipe(
                catchError((err) => this.rollback$(community.uuid, null, null, err)),
                switchMap((standaloneAdmin) =>
                  this.groupApi
                    .addSubgroup(
                      tech.uuid,
                      buildAbsoluteApiUrl(`${GROUPS_COLLECTION_PATH}/${standaloneAdmin.uuid}`),
                    )
                    .pipe(
                      catchError((err) =>
                        this.rollback$(community.uuid, standaloneAdmin.uuid, null, err),
                      ),
                      switchMap(() =>
                        this.groupApi
                          .create({
                            name: `SUBMITTERS_${sufijo}`,
                            metadata: this.descriptionMetadata(`Personal delegado de ${body.name}`),
                          })
                          .pipe(
                            catchError((err) =>
                              this.rollback$(community.uuid, standaloneAdmin.uuid, null, err),
                            ),
                            switchMap((standaloneSubmitters) =>
                              /* Anota los uuids de ambos grupos en la community:
                               * es la única relación grupo-subdirección que no
                               * depende de nombres (create/delete la leen de acá). */
                              this.communityApi
                                .updateMetadata(community.uuid, [
                                  addOp('/metadata/digeex.adminGroup', [
                                    { value: standaloneAdmin.uuid },
                                  ]),
                                  addOp('/metadata/digeex.submittersGroup', [
                                    { value: standaloneSubmitters.uuid },
                                  ]),
                                ])
                                .pipe(
                                  catchError((err) =>
                                    this.rollback$(
                                      community.uuid,
                                      standaloneAdmin.uuid,
                                      standaloneSubmitters.uuid,
                                      err,
                                    ),
                                  ),
                                  map(() => community),
                                ),
                            ),
                          ),
                      ),
                    ),
                ),
              ),
          ),
        ),
      ),
    );
  }

  private rollback$(
    communityUuid: string | null,
    standaloneAdminUuid: string | null,
    standaloneSubmittersUuid: string | null,
    originalError: unknown,
  ): Observable<never> {
    const cleanup$: Observable<unknown>[] = [];
    if (standaloneSubmittersUuid) {
      cleanup$.push(this.groupApi.delete(standaloneSubmittersUuid));
    }
    if (standaloneAdminUuid) {
      cleanup$.push(this.groupApi.delete(standaloneAdminUuid));
    }
    if (communityUuid) {
      cleanup$.push(this.communityApi.delete(communityUuid));
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
