import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Item } from './models/item.model';
import { JsonPatchEntry } from './json-patch.util';
import { DSPACE_API_BASE, ITEMS_PATH } from './dspace-rest.util';

/**
 * Wrapper HTTP del recurso /api/core/items de DSpace 9.x. En este ciclo
 * se expone solo el PATCH genérico que el SubmissionFacade necesita para
 * marcar items como no-discoverable (privados nivel discovery). Las
 * lecturas (getOne, search por collection) siguen en DSpaceApiService
 * hasta que C15 haga la migración completa y agregue withdraw + restore.
 */
@Injectable({ providedIn: 'root' })
export class ItemApiService {
  private readonly http = inject(HttpClient);

  /**
   * Aplica un parche JSON sobre el item y devuelve el recurso completo
   * actualizado. El cuerpo es un arreglo de operaciones JSON Patch
   * (RFC 6902); los paths soportados por DSpace incluyen
   * `/metadata/<schema>.<element>...`, `/discoverable` y `/withdrawn`.
   */
  updateMetadata(uuid: string, patch: JsonPatchEntry[]): Observable<Item> {
    return this.http.patch<Item>(
      `${DSPACE_API_BASE}${ITEMS_PATH}/${uuid}`,
      patch,
    );
  }
}
