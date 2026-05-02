import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Collection } from './models/collection.model';
import { HalListResponse } from './models/hal.model';
import {
  DSPACE_API_BASE,
  COLLECTIONS_PATH,
  COMMUNITIES_PATH,
  ITEMS_PATH,
} from './dspace-rest.util';

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
}
