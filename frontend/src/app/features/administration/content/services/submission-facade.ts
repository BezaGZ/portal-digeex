import { Injectable, inject } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, map, mergeMap, switchMap, toArray } from 'rxjs/operators';
import { resolveCaller$, rollbackCascade } from './facade-utils';

/**
 * Cuántos uploads de bitstream pueden estar en vuelo a la vez sobre el
 * mismo workspaceitem. Sweet spot conservador: una galería de 100 fotos
 * sube en ~13s sin saturar el backend Tomcat single-instance. Si en
 * producción se ve que aguanta más, subirlo. Si se atraganta, bajarlo.
 */
const MAX_PARALLEL_UPLOADS = 8;
import { WorkspaceItemApiService } from '../../../../core/api/workspaceitem-api.service';
import { ItemApiService } from '../../../../core/api/item-api.service';
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
}

/**
 * Coordina la submission completa de un item contra DSpace. Valida el
 * scope del caller, crea el workspaceitem, parcha la metadata, sube los
 * bitstreams, acepta la licencia, archiva el item commiteando al
 * workflow, y si la submission es privada hace un PATCH adicional sobre
 * `/discoverable` del item ya archivado.
 *
 * Caveat documentado de la liberación: privacidad nivel discovery (el
 * item no aparece en búsqueda ni listados) pero el item sigue siendo
 * accesible por URL directa. Privacidad fuerte (resourcepolicies de
 * Anonymous READ) queda como deuda explícita Sprint 7+.
 */
@Injectable({ providedIn: 'root' })
export class SubmissionFacade {
  private readonly workspace = inject(WorkspaceItemApiService);
  private readonly itemApi = inject(ItemApiService);
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
    return from(files).pipe(
      mergeMap((file) => this.workspace.uploadFile(workspaceId, file), MAX_PARALLEL_UPLOADS),
      toArray(),
    );
  }

  private applyVisibility$(item: Item, visibility: 'public' | 'private'): Observable<unknown> {
    if (visibility === 'private') {
      return this.itemApi.updateMetadata(item.uuid, this.privatePatch());
    }
    return of(undefined);
  }

  private buildMetadataPatch(req: SubmitItemRequest): JsonPatchEntry[] {
    return Object.entries(req.metadata).map(([key, value]) => ({
      op: 'add' as const,
      path: `/sections/${req.sectionName}/${key}`,
      value,
    }));
  }

  private licensePatch(): JsonPatchEntry[] {
    // El campo /sections/license/granted ya existe con valor false en el
    // workspaceitem recién creado, así que replace es la operación correcta
    // por RFC 6902 ("The target location MUST exist for replace").
    return [{ op: 'replace', path: '/sections/license/granted', value: true }];
  }

  private privatePatch(): JsonPatchEntry[] {
    return [{ op: 'replace', path: '/discoverable', value: false }];
  }
}
