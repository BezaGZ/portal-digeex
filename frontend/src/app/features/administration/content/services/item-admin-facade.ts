import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Item } from '../../../../core/api/models/item.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';
import { resolveCaller$ } from './facade-utils';

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
