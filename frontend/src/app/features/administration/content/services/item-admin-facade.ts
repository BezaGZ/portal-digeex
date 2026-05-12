import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { last, switchMap } from 'rxjs/operators';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { BundleApiService } from '../../../../core/api/bundle-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Item } from '../../../../core/api/models/item.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';
import { resolveCaller$ } from './facade-utils';

/**
 * Bundle de cambios para edición de item archivado. Cada campo es opcional
 * y dispara su step correspondiente solo si está presente y aporta diff.
 */
export interface EditItemPayload {
  patch: JsonPatchEntry[];
  visibility?: 'public' | 'private';
  coverFile?: File;
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

  /** Aplica un parche JSON sobre la metadata del item archivado. */
  updateItem$(
    uuid: string,
    patch: JsonPatchEntry[],
    sufijoSubdireccion: string,
  ): Observable<Item> {
    return this.runScoped$(sufijoSubdireccion, () =>
      this.itemApi.updateMetadata(uuid, patch),
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
      if (steps$.length === 0) {
        return of(payload.item);
      }
      return this.runStepsSequential$(steps$, uuid);
    });
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
   * con deletes concurrentes al mismo bundle (misma lección del Ciclo 19).
   */
  private replaceCover$(bundleUuid: string, coverFile: File): Observable<unknown> {
    return this.bundleApi.listBitstreams(bundleUuid).pipe(
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

  /** Marca el item como withdrawn (queda fuera del portal público pero restorable). */
  withdrawItem$(uuid: string, sufijoSubdireccion: string): Observable<Item> {
    return this.runScoped$(sufijoSubdireccion, () => this.itemApi.withdraw(uuid));
  }

  /** Devuelve un item previamente withdrawn al portal público. */
  restoreItem$(uuid: string, sufijoSubdireccion: string): Observable<Item> {
    return this.runScoped$(sufijoSubdireccion, () => this.itemApi.restore(uuid));
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
}
