import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Collection, CollectionCreateBody } from './models/collection.model';
import { Group, AssociatedGroupCreateBody } from './models/group.model';
import { HalListResponse } from './models/hal.model';
import {
  DSPACE_API_BASE,
  COLLECTIONS_PATH,
  COMMUNITIES_PATH,
  ITEMS_PATH,
} from './dspace-rest.util';
import { JsonPatchEntry } from './json-patch.util';

/**
 * Wrapper HTTP del recurso `/api/core/collections` de DSpace.
 *
 * Expone el listado completo (`list`), el listado por community padre
 * (`listByCommunity`), una collection por UUID con embed opcional para
 * subrecursos como `submittersGroup` (`getOne`) y la collection dueña de
 * un item dado (`getOwningCollectionOfItem`).
 */
@Injectable({ providedIn: 'root' })
export class CollectionApiService {
  private readonly http = inject(HttpClient);

  /** Lista paginada de todas las colecciones del repositorio (sin filtrar por community). */
  list(page = 0, size = 100): Observable<HalListResponse<Collection>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<HalListResponse<Collection>>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}`,
      { params },
    );
  }

  /** Lista paginada de colecciones que pertenecen a una community específica. */
  listByCommunity(
    communityUuid: string,
    page = 0,
    size = 20,
  ): Observable<HalListResponse<Collection>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<HalListResponse<Collection>>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${communityUuid}/collections`,
      { params },
    );
  }

  /**
   * Obtiene una colección por UUID. `embed` proyecta subrecursos
   * (por ejemplo `submittersGroup` para resolver el grupo destino al dar
   * de alta personal_delegado).
   */
  getOne(uuid: string, options: { embed?: string } = {}): Observable<Collection> {
    let params = new HttpParams();
    if (options.embed) {
      params = params.set('embed', options.embed);
    }
    return this.http.get<Collection>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}/${uuid}`,
      { params },
    );
  }

  /**
   * Devuelve la colección dueña de un item. Útil cuando solo se conoce el
   * UUID del item (resultados de búsqueda) y se necesita armar URLs
   * canónicas tipo `/programas/{collectionUuid}/documentos/{itemUuid}`.
   */
  getOwningCollectionOfItem(itemUuid: string): Observable<Collection> {
    return this.http.get<Collection>(
      `${DSPACE_API_BASE}${ITEMS_PATH}/${itemUuid}/owningCollection`,
    );
  }

  /**
   * Crea una collection bajo la community padre indicada. DSpace devuelve
   * la collection con `uuid`, `handle` y los `_links` asignados. El CSRF
   * token y el JWT los inyecta el `csrfInterceptor` y el `authInterceptor`
   * automáticamente sobre toda mutación.
   */
  create(parentUuid: string, body: CollectionCreateBody): Observable<Collection> {
    const params = new HttpParams().set('parent', parentUuid);
    return this.http.post<Collection>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}`,
      body,
      { params },
    );
  }

  /**
   * Aplica un parche JSON sobre la collection y devuelve el recurso completo
   * actualizado. El body es un arreglo de operaciones JSON Patch (RFC 6902);
   * los helpers `replaceOp`, `addOp` y `removeOp` de `json-patch.util` arman
   * cada entrada sin que el caller tenga que repetir la estructura `{op,
   * path, value}`.
   */
  updateMetadata(uuid: string, patch: JsonPatchEntry[]): Observable<Collection> {
    return this.http.patch<Collection>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}/${uuid}`,
      patch,
    );
  }

  /**
   * Borra una collection por UUID. DSpace responde 204 sin body en caso de
   * éxito; el wrapper expone `Observable<void>` para reflejar esa semántica
   * y forzar al caller a manejar solo error/complete (no payload).
   */
  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}/${uuid}`,
    );
  }

  /**
   * Crea el submittersGroup asociado a la collection indicada. DSpace lo
   * nombra automáticamente (`COLLECTION_<uuid>_SUBMIT`) — el contrato 9.x
   * prohíbe fijar nombre en este endpoint, por eso el body solo lleva
   * metadata opcional. Verificado empíricamente el 2 de mayo 2026: DSpace
   * NO auto-instancia el submittersGroup al crear la collection (GET sobre
   * el subrecurso devuelve 204 sin body), hay que pegarlo explícitamente.
   * El facade del Bloque 1 hace este POST y luego enlaza `SUBMITTERS_<sufijo>`
   * como subgrupo del Group resultante con `GroupApiService.addSubgroup`.
   */
  createSubmittersGroup(
    collectionUuid: string,
    body: AssociatedGroupCreateBody = {},
  ): Observable<Group> {
    return this.http.post<Group>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}/${collectionUuid}/submittersGroup`,
      body,
    );
  }
}
