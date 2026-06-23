import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { Community, CommunityCreateBody } from '../../../../core/api/models/community.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';
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
            resourceSufijo: null,
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
            resourceSufijo: null,
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
   * admin_subdireccion sobre la suya (matching sufijo). El sufijo lo pasa
   * el caller para que la validación de scope sea inmediata sin depender
   * de un lookup adicional.
   */
  updateSubdireccion$(uuid: string, patch: JsonPatchEntry[], sufijo: string): Observable<Community> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'community-sub',
            resourceSufijo: sufijo,
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
   * SUBMITTERS standalone). Solo SuperAdmin. Orden: primero los grupos
   * (porque DSpace cascadea el adminGroup técnico al borrar la community,
   * pero los standalone no), después la community.
   */
  deleteSubdireccion$(uuid: string, sufijo: string): Observable<void> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'community-sub',
            resourceSufijo: sufijo,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.groupApi.getByName(`SUBMITTERS_${sufijo}`).pipe(
          switchMap((subm) => this.groupApi.delete(subm.uuid)),
          switchMap(() => this.groupApi.getByName(`ADMIN_${sufijo}`)),
          switchMap((admin) => this.groupApi.delete(admin.uuid)),
          switchMap(() => this.communityApi.delete(uuid)),
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
          catchError((err) => this.rollback$(community.uuid, null, err)),
          switchMap((tech) =>
            this.groupApi
              .create({
                name: `ADMIN_${sufijo}`,
                metadata: this.descriptionMetadata(`Administradores de ${body.name}`),
              })
              .pipe(
                catchError((err) => this.rollback$(community.uuid, null, err)),
                switchMap((standaloneAdmin) =>
                  this.groupApi
                    .addSubgroup(
                      tech.uuid,
                      buildAbsoluteApiUrl(`${GROUPS_COLLECTION_PATH}/${standaloneAdmin.uuid}`),
                    )
                    .pipe(
                      catchError((err) =>
                        this.rollback$(community.uuid, standaloneAdmin.uuid, err),
                      ),
                      switchMap(() =>
                        this.groupApi
                          .create({
                            name: `SUBMITTERS_${sufijo}`,
                            metadata: this.descriptionMetadata(`Personal delegado de ${body.name}`),
                          })
                          .pipe(
                            catchError((err) =>
                              this.rollback$(community.uuid, standaloneAdmin.uuid, err),
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
    );
  }

  private rollback$(
    communityUuid: string | null,
    standaloneAdminUuid: string | null,
    originalError: unknown,
  ): Observable<never> {
    const cleanup$: Observable<unknown>[] = [];
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
