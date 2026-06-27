import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
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

  /**
   * Trae el item por UUID. Lo usa la pantalla de edición para cargar
   * el recurso antes de mostrar el form. La lectura por colección sigue
   * en DSpaceApiService hasta que el ciclo de cleanup migre todos los
   * consumidores al wrapper específico.
   */
  getOne(uuid: string): Observable<Item> {
    return this.http.get<Item>(`${DSPACE_API_BASE}${ITEMS_PATH}/${uuid}`);
  }

  /**
   * Marca el item como withdrawn (soft delete). DSpace lo oculta del
   * portal público pero queda restorable. PATCH replace sobre el flag
   * por contrato 9.x.
   */
  withdraw(uuid: string): Observable<Item> {
    return this.updateMetadata(uuid, [
      { op: 'replace', path: '/withdrawn', value: true },
    ]);
  }

  /**
   * Restaura un item previamente withdrawn. PATCH inverso al anterior.
   */
  restore(uuid: string): Observable<Item> {
    return this.updateMetadata(uuid, [
      { op: 'replace', path: '/withdrawn', value: false },
    ]);
  }

  /**
   * Borra el item en duro por UUID. DSpace responde 204 sin body en caso de
   * éxito; el wrapper expone `Observable<void>` para reflejar esa semántica
   * y forzar al caller a manejar solo error/complete (no payload).
   */
  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(
      `${DSPACE_API_BASE}${ITEMS_PATH}/${uuid}`,
    );
  }

  /**
   * Devuelve el uuid del submitter (eperson que subió el item) o `null` si
   * no lo expone o falla. Lo usa el `ownSubmissionGuard` para confinar la
   * edición del delegado a lo que él subió. Sub-recurso `submitter` del
   * contrato 9.x. Falla cerrado: ante error resuelve `null` (el guard lo trata
   * como "no es tuyo"), no lanza.
   */
  getSubmitter(uuid: string): Observable<string | null> {
    return this.http
      .get<{ uuid?: string }>(`${DSPACE_API_BASE}${ITEMS_PATH}/${uuid}/submitter`)
      .pipe(
        map((eperson) => eperson?.uuid ?? null),
        catchError(() => of(null)),
      );
  }
}
