import { Injectable, inject } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap, map, switchMap, toArray } from 'rxjs/operators';
import { resolveCaller$, rollbackCascade } from './facade-utils';
import { WorkspaceItemApiService } from '../../../../core/api/workspaceitem-api.service';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { BundleApiService } from '../../../../core/api/bundle-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Item } from '../../../../core/api/models/item.model';
import { MetadataValue } from '../../../../core/api/models/metadata.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';

/**
 * Datos que el form de submission entrega al facade. La metadata se
 * pasa como un dict `dc.<element>.<qualifier>` → array de valores; el
 * facade lo traduce a JSON Patch sobre `/sections/<sectionName>/<key>`.
 * `sectionName` corresponde al step del submission process configurado
 * para el entity-type de la collection (`traditionalpageone` por defecto
 * o el id del step custom de DIGEEX como `digeex-documento`).
 */
export interface SubmitItemRequest {
  collectionUuid: string;
  sectionName: string;
  metadata: Record<string, MetadataValue[]>;
  files: File[];
  visibility: 'public' | 'private';
  sufijoSubdireccion: string;
  /**
   * Imagen opcional que el usuario subió como portada manual del item. Se
   * coloca en el bundle THUMBNAIL post-archive (la submission API solo
   * soporta upload al ORIGINAL); si DSpace ya tiene un thumbnail
   * autogenerado, el manual se agrega al mismo bundle.
   */
  coverFile?: File;
}

/**
 * Coordina la submission completa de un item contra DSpace. Valida el
 * scope del caller, crea el workspaceitem, parcha la metadata, sube los
 * bitstreams, acepta la licencia, archiva el item commiteando al
 * workflow, y si la submission es privada hace un PATCH adicional sobre
 * `/discoverable` del item ya archivado.
 *
 * Privacidad nivel discovery (el item no aparece en búsqueda ni listados)
 * pero el item sigue accesible por URL directa. Privacidad fuerte
 * (resourcepolicies de Anonymous READ) no la cubre este flujo.
 */
@Injectable({ providedIn: 'root' })
export class SubmissionFacade {
  private readonly workspace = inject(WorkspaceItemApiService);
  private readonly itemApi = inject(ItemApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly scope = inject(ContentScopeService);
  private readonly authCaller = inject(AuthCallerService);

  submitItem$(req: SubmitItemRequest): Observable<Item> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'item',
            resourceSufijo: req.sufijoSubdireccion,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return this.runSubmissionPipeline$(req);
      }),
    );
  }

  private runSubmissionPipeline$(req: SubmitItemRequest): Observable<Item> {
    return this.workspace.create(req.collectionUuid).pipe(
      switchMap((ws) =>
        this.workspace.patchSection(ws.id, this.buildMetadataPatch(req)).pipe(
          switchMap(() => this.uploadAllFiles$(ws.id, req.files)),
          switchMap(() => this.workspace.patchSection(ws.id, this.licensePatch())),
          switchMap(() => this.workspace.getItem(ws.id)),
          switchMap((item) =>
            this.workspace.commit(ws.id).pipe(
              switchMap(() => this.applyCover$(item, req.coverFile)),
              switchMap(() => this.applyVisibility$(item, req.visibility)),
              map(() => item),
            ),
          ),
          catchError((err) => rollbackCascade([this.workspace.delete(ws.id)], err)),
        ),
      ),
    );
  }

  private uploadAllFiles$(workspaceId: number, files: File[]): Observable<unknown> {
    if (files.length === 0) {
      return of(undefined);
    }
    /**
     * Uploads secuenciales (concatMap, no mergeMap). DSpace 9.x persiste el
     * workspaceitem entero al final de cada POST de upload sin lock optimista
     * (RestContract/workspaceitems.md describe el endpoint como "creation of
     * a new file" singular, sin batch concurrente). Dos POST en paralelo al
     * mismo workspaceitem provocan lost update y se pierde un bitstream.
     */
    return from(files).pipe(
      concatMap((file) => this.workspace.uploadFile(workspaceId, file)),
      toArray(),
    );
  }

  private applyVisibility$(item: Item, visibility: 'public' | 'private'): Observable<unknown> {
    if (visibility === 'private') {
      return this.itemApi.updateMetadata(item.uuid, this.privatePatch());
    }
    return of(undefined);
  }

  /**
   * Coloca la portada manual en el bundle THUMBNAIL del item ya archivado.
   * Si no hay coverFile, no-op. Si DSpace ya tiene un THUMBNAIL (autogenerado
   * por el media filter), reusamos ese bundle (decisión 6.a.1: convivir con
   * el autogenerado, el componente público toma el primer bitstream del bundle
   * que normalmente es el manual subido primero).
   */
  private applyCover$(item: Item, coverFile?: File): Observable<unknown> {
    if (!coverFile) return of(undefined);
    return this.bundleApi.listForItem(item.uuid).pipe(
      switchMap((response) => {
        const existing = (response._embedded?.bundles ?? []).find((b) => b.name === 'THUMBNAIL');
        const bundle$ = existing
          ? of(existing)
          : this.bundleApi.createBundle(item.uuid, 'THUMBNAIL');
        return bundle$.pipe(
          switchMap((bundle) => this.bundleApi.uploadBitstream(bundle.uuid, coverFile)),
        );
      }),
    );
  }

  private buildMetadataPatch(req: SubmitItemRequest): JsonPatchEntry[] {
    return Object.entries(req.metadata).map(([key, value]) => ({
      op: 'add' as const,
      path: `/sections/${req.sectionName}/${key}`,
      value,
    }));
  }

  private licensePatch(): JsonPatchEntry[] {
    /**
     * El campo /sections/license/granted ya existe con valor false en el
     * workspaceitem recién creado, así que replace es la operación correcta
     * por RFC 6902 ("The target location MUST exist for replace").
     */
    return [{ op: 'replace', path: '/sections/license/granted', value: true }];
  }

  private privatePatch(): JsonPatchEntry[] {
    return [{ op: 'replace', path: '/discoverable', value: false }];
  }
}
