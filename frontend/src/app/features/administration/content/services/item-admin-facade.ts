import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { last, map, switchMap } from 'rxjs/operators';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { BundleApiService } from '../../../../core/api/bundle-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Item } from '../../../../core/api/models/item.model';
import { Bitstream } from '../../../../core/api/models/bitstream.model';
import { Paginated } from '../../../../core/api/models/hal.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';
import { resolveCaller$, withAudit$ } from './facade-utils';
import { AUDIT_ACTIONS, AuditTrailService } from '../provenance/audit-trail.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { isSuperadmin } from '../../../../core/auth/role-capabilities';

/**
 * Bundle de cambios para edición de item archivado. Cada campo es opcional
 * y dispara su step correspondiente solo si está presente y aporta diff.
 */
export interface EditItemPayload {
  patch: JsonPatchEntry[];
  visibility?: 'public' | 'private';
  coverFile?: File;
  /** UUIDs de bitstreams del bundle ORIGINAL a borrar antes de subir los nuevos. */
  bitstreamsToRemove?: string[];
  /** Archivos a subir al bundle ORIGINAL después de los borrados. */
  bitstreamsToAdd?: File[];
  /** El item actual sirve para comparar discoverable y decidir si visibility cambió. */
  item: Item;
}

/**
 * Coordina la edición y el soft delete de items archivados (F-07 + F-08).
 * Cada método valida scope antes de tocar HTTP y delega al wrapper. La
 * UI conoce el sufijo de la subdirección porque navega desde la
 * colección, así que se lo pasa al facade en lugar de inferirlo
 * navegando el árbol jerárquico.
 */
@Injectable({ providedIn: 'root' })
export class ItemAdminFacade {
  private readonly itemApi = inject(ItemApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly scope = inject(ContentScopeService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly audit = inject(AuditTrailService);

  /** Aplica un parche JSON sobre la metadata del item archivado. */
  updateItem$(
    uuid: string,
    patch: JsonPatchEntry[],
    sufijoSubdireccion: string,
  ): Observable<Item> {
    return this.runScoped$(sufijoSubdireccion, () =>
      this.itemApi.updateMetadata(uuid, patch).pipe(withAudit$<Item>(this.audit, 'item', AUDIT_ACTIONS.EDITED)),
    );
  }

  /**
   * Edita un item archivado aplicando uno o más de: parche de metadata,
   * cambio de `/discoverable` y subida de portada al bundle THUMBNAIL.
   * Cada paso se ejecuta solo si aporta diff respecto al item recibido.
   */
  editItem$(
    uuid: string,
    payload: EditItemPayload,
    sufijoSubdireccion: string,
  ): Observable<Item> {
    return this.runScoped$(sufijoSubdireccion, () => {
      const steps$: Observable<unknown>[] = [];
      if (payload.patch.length > 0) {
        steps$.push(this.itemApi.updateMetadata(uuid, payload.patch));
      }
      const targetDiscoverable =
        payload.visibility === undefined ? null : payload.visibility === 'public';
      if (targetDiscoverable !== null && targetDiscoverable !== payload.item.discoverable) {
        steps$.push(
          this.itemApi.updateMetadata(uuid, [
            { op: 'replace', path: '/discoverable', value: targetDiscoverable },
          ]),
        );
      }
      if (payload.coverFile) {
        steps$.push(this.applyCover$(uuid, payload.coverFile));
      }
      const removes = payload.bitstreamsToRemove ?? [];
      if (removes.length > 0) {
        steps$.push(this.removeBitstreams$(removes));
      }
      const adds = payload.bitstreamsToAdd ?? [];
      if (adds.length > 0) {
        steps$.push(this.addBitstreams$(uuid, adds));
      }
      if (steps$.length === 0) {
        return of(payload.item);
      }
      return this.runStepsSequential$(steps$, uuid).pipe(withAudit$<Item>(this.audit, 'item', AUDIT_ACTIONS.EDITED));
    });
  }

  /**
   * Borra los uuids indicados secuencialmente. Misma cautela que `replaceCover$`:
   * deletes paralelos al mismo bundle disparaban 500 intermitentes en DSpace 9.
   */
  private removeBitstreams$(uuids: string[]): Observable<unknown> {
    return uuids
      .map((uuid) => this.bundleApi.deleteBitstream(uuid))
      .reduce(
        (acc, step) => acc.pipe(switchMap(() => step)),
        of(null as unknown),
      );
  }

  /**
   * Resuelve el bundle ORIGINAL del item (un único `listForItem`) y sube cada
   * archivo secuencial. Todo item archivado tiene ORIGINAL desde el flujo
   * de submission; si falta, propagamos el error en lugar de crearlo silenciosamente.
   */
  private addBitstreams$(itemUuid: string, files: File[]): Observable<unknown> {
    return this.bundleApi.listForItem(itemUuid).pipe(
      switchMap((response) => {
        const original = (response._embedded?.bundles ?? []).find((b) => b.name === 'ORIGINAL');
        if (!original) {
          return throwError(() => new Error('ORIGINAL bundle no encontrado en el item.'));
        }
        return files
          .map((file) => this.bundleApi.uploadBitstream(original.uuid, file))
          .reduce(
            (acc, step) => acc.pipe(switchMap(() => step)),
            of(null as unknown),
          );
      }),
    );
  }

  /**
   * Encadena los steps con `concatMap` y cierra con un `getOne(uuid)` para
   * devolver el `Item` actualizado. Normaliza el retorno ante steps que
   * devuelven shapes distintos (cover devuelve bitstream, visibility devuelve item).
   */
  private runStepsSequential$(
    steps: Observable<unknown>[],
    uuid: string,
  ): Observable<Item> {
    return steps.reduce((acc, step) => acc.pipe(switchMap(() => step)), of(null as unknown)).pipe(
      last(),
      switchMap(() => this.itemApi.getOne(uuid)),
    );
  }

  /**
   * Coloca la portada en el bundle THUMBNAIL del item. Si el bundle ya
   * existía, borra sus bitstreams previos antes de subir el nuevo para
   * que el cover quede reemplazado y no acumulado.
   */
  private applyCover$(itemUuid: string, coverFile: File): Observable<unknown> {
    return this.bundleApi.listForItem(itemUuid).pipe(
      switchMap((response) => {
        const existing = (response._embedded?.bundles ?? []).find((b) => b.name === 'THUMBNAIL');
        if (existing) {
          return this.replaceCover$(existing.uuid, coverFile);
        }
        return this.bundleApi
          .createBundle(itemUuid, 'THUMBNAIL')
          .pipe(
            switchMap((bundle) => this.bundleApi.uploadBitstream(bundle.uuid, coverFile)),
          );
      }),
    );
  }

  /**
   * Borra los bitstreams del bundle existente y sube el nuevo. Los DELETE
   * se hacen secuenciales con `concatMap` porque DSpace 9 a veces tira 500
   * con deletes concurrentes al mismo bundle.
   */
  private replaceCover$(bundleUuid: string, coverFile: File): Observable<unknown> {
    return this.bundleApi.listBitstreams(bundleUuid).pipe(
      map((p) => p.items),
      switchMap((bitstreams) => {
        const deletes$ = bitstreams
          .map((b) => this.bundleApi.deleteBitstream(b.uuid))
          .reduce(
            (acc, step) => acc.pipe(switchMap(() => step)),
            of(null as unknown),
          );
        return deletes$.pipe(
          switchMap(() => this.bundleApi.uploadBitstream(bundleUuid, coverFile)),
        );
      }),
    );
  }

  /**
   * Lista paginada de bitstreams del bundle ORIGINAL del item. La consume el
   * form de edición para mostrar la tabla "Archivos actuales" con paginator.
   * No valida scope: es una lectura sobre un item al que el usuario ya tiene
   * acceso por ruta protegida.
   */
  listOriginalBitstreams$(
    itemUuid: string,
    page: number,
    size: number,
  ): Observable<Paginated<Bitstream>> {
    return this.bundleApi.listForItem(itemUuid).pipe(
      switchMap((response) => {
        const original = (response._embedded?.bundles ?? []).find(
          (b) => b.name === 'ORIGINAL',
        );
        if (!original) {
          return throwError(
            () => new Error('ORIGINAL bundle no encontrado en el item.'),
          );
        }
        return this.bundleApi.listBitstreams(original.uuid, page, size);
      }),
    );
  }

  /**
   * Marca el item como withdrawn (queda fuera del portal público pero restorable).
   * No appendea provenance manual: DSpace 9 escribe `Item withdrawn by …`
   * automáticamente al disparar el endpoint (verificado el 2026-06-05).
   */
  withdrawItem$(uuid: string, sufijoSubdireccion: string): Observable<Item> {
    return this.runScoped$(sufijoSubdireccion, () => this.itemApi.withdraw(uuid));
  }

  /**
   * Devuelve un item previamente withdrawn al portal público. DSpace 9
   * escribe `Item reinstated by …` automáticamente.
   */
  restoreItem$(uuid: string, sufijoSubdireccion: string): Observable<Item> {
    return this.runScoped$(sufijoSubdireccion, () => this.itemApi.restore(uuid));
  }

  /**
   * Borra el ítem en duro. Reservado al superadministrador (RN-16 y las flags
   * collection/community-admin.item.delete en false); el facade falla cerrado
   * para el resto. No appendea provenance: el DSO se destruye y no puede recibirla.
   */
  deleteItem$(uuid: string): Observable<void> {
    return this.runAsSuperadmin$(() => this.itemApi.delete(uuid));
  }

  private runScoped$<T>(
    sufijoSubdireccion: string,
    op: () => Observable<T>,
  ): Observable<T> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        try {
          this.scope.assertWithinScope({
            dsoType: 'item',
            resourceSufijo: sufijoSubdireccion,
            caller,
          });
        } catch (err) {
          return throwError(() => err);
        }
        return op();
      }),
    );
  }

  /**
   * Ejecuta `op` solo si el caller es superadmin; si no, rechaza con
   * BusinessRuleError sin tocar HTTP. Separado de `runScoped$` porque el
   * borrado en duro no scopea por sufijo: es del administrador del sitio o de nadie.
   */
  private runAsSuperadmin$<T>(op: () => Observable<T>): Observable<T> {
    return resolveCaller$(this.authCaller).pipe(
      switchMap((caller) => {
        if (!isSuperadmin(caller)) {
          return throwError(
            () =>
              new BusinessRuleError(
                'OUT_OF_SCOPE',
                'Borrado en duro reservado al superadministrador.',
              ),
          );
        }
        return op();
      }),
    );
  }
}
