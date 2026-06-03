import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { EMPTY, Observable } from 'rxjs';
import { expand, map, reduce } from 'rxjs/operators';
import { Collection, CollectionCreateBody } from './models/collection.model';
import { Group, AssociatedGroupCreateBody } from './models/group.model';
import { Bitstream } from './models/bitstream.model';
import { HalListResponse } from './models/hal.model';
import {
  COLLECTIONS_PATH,
  COMMUNITIES_PATH,
  DSPACE_API_BASE,
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

  /**
   * Lista paginada de todas las colecciones del repositorio. `options.embed`
   * proyecta subrecursos en la misma respuesta — p. ej. `'logo'` para evitar
   * una llamada extra por collection desde home/listados públicos.
   * `options.sort` se pasa tal cual al backend (formato Spring Data:
   * `"campo,direccion"`, p. ej. `"archivedItemsCount,desc"`). Usado por el
   * widget Top colecciones para pedirle al servidor que ordene globalmente
   * y traiga solo `size=limit` registros, evitando size hardcoded.
   */
  list(
    page = 0,
    size = 100,
    options: { embed?: string; sort?: string } = {},
  ): Observable<HalListResponse<Collection>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (options.embed) {
      params = params.set('embed', options.embed);
    }
    if (options.sort) {
      params = params.set('sort', options.sort);
    }
    return this.http.get<HalListResponse<Collection>>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}`,
      { params },
    );
  }

  /**
   * Lista paginada de colecciones que pertenecen a una community específica.
   * Mismo `options.embed` que `list` para que el admin precargue el logo en
   * el listado por subdirección. `options.sort` permite ordenar server-side
   * (mismo formato Spring Data que `list`).
   */
  listByCommunity(
    communityUuid: string,
    page = 0,
    size = 20,
    options: { embed?: string; sort?: string } = {},
  ): Observable<HalListResponse<Collection>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (options.embed) {
      params = params.set('embed', options.embed);
    }
    if (options.sort) {
      params = params.set('sort', options.sort);
    }
    return this.http.get<HalListResponse<Collection>>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${communityUuid}/collections`,
      { params },
    );
  }

  /**
   * Materializa TODAS las colecciones del repositorio agotando páginas
   * (`expand`+`reduce`) sin imponer `size` desde el frontend. Mismo
   * patrón que `VocabularyApiService.getEntries`: el backend usa su
   * default `spring.data.rest.default-page-size`.
   */
  listAll(options: { embed?: string } = {}): Observable<Collection[]> {
    return this.fetchAllPage$(0, options.embed).pipe(
      expand((resp) => {
        const next = (resp.page?.number ?? 0) + 1;
        return next < (resp.page?.totalPages ?? 0)
          ? this.fetchAllPage$(next, options.embed)
          : EMPTY;
      }),
      reduce(
        (acc, resp) => [...acc, ...(resp._embedded?.['collections'] ?? [])],
        [] as Collection[],
      ),
    );
  }

  /** Versión scope-filtered de `listAll` para una community específica. */
  listAllByCommunity(
    communityUuid: string,
    options: { embed?: string } = {},
  ): Observable<Collection[]> {
    return this.fetchByCommunityPage$(communityUuid, 0, options.embed).pipe(
      expand((resp) => {
        const next = (resp.page?.number ?? 0) + 1;
        return next < (resp.page?.totalPages ?? 0)
          ? this.fetchByCommunityPage$(communityUuid, next, options.embed)
          : EMPTY;
      }),
      reduce(
        (acc, resp) => [...acc, ...(resp._embedded?.['collections'] ?? [])],
        [] as Collection[],
      ),
    );
  }

  /**
   * Fetch de una página del listado completo. Página 0 sin parámetros
   * (DSpace usa su default); siguientes solo mandan `page`.
   */
  private fetchAllPage$(
    page: number,
    embed?: string,
  ): Observable<HalListResponse<Collection>> {
    let params = new HttpParams();
    if (page > 0) params = params.set('page', String(page));
    if (embed) params = params.set('embed', embed);
    return this.http.get<HalListResponse<Collection>>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}`,
      { params },
    );
  }

  /**
   * Fetch de una página del listado por community. Misma convención que
   * `fetchAllPage$`: página 0 sin params, siguientes solo `page`.
   */
  private fetchByCommunityPage$(
    communityUuid: string,
    page: number,
    embed?: string,
  ): Observable<HalListResponse<Collection>> {
    let params = new HttpParams();
    if (page > 0) params = params.set('page', String(page));
    if (embed) params = params.set('embed', embed);
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

  /**
   * Crea el adminGroup asociado a la collection indicada. DSpace lo nombra
   * automáticamente (`COLLECTION_<uuid>_admin`) — mismo patrón del
   * `createSubmittersGroup`: el contrato 9.x prohíbe fijar nombre, el body
   * solo lleva metadata opcional. El facade del Ciclo 40 enlaza
   * `SUBMITTERS_<sufijo>` como subgrupo del Group resultante para que los
   * delegados hereden ADMIN sobre la coll recién creada.
   */
  createAdminGroup(
    collectionUuid: string,
    body: AssociatedGroupCreateBody = {},
  ): Observable<Group> {
    return this.http.post<Group>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}/${collectionUuid}/adminGroup`,
      body,
    );
  }

  /**
   * Devuelve el bitstream del logo de la collection, o `null` cuando aún no
   * tiene uno. DSpace responde 204 sin body en ese caso y `observe: 'response'`
   * permite distinguirlo del 200 con bitstream sin caer en `catchError`.
   */
  getLogo(uuid: string): Observable<Bitstream | null> {
    return this.http
      .get<Bitstream>(`${DSPACE_API_BASE}${COLLECTIONS_PATH}/${uuid}/logo`, {
        observe: 'response',
      })
      .pipe(
        map((res: HttpResponse<Bitstream>) =>
          res.status === 204 ? null : res.body,
        ),
      );
  }

  /**
   * Sube el logo de la collection. Multipart con el archivo en el campo `file`.
   * DSpace tira 422 si la collection YA tiene logo, así que el caller debe
   * borrarlo antes (eso lo orquesta `CollectionFacade.replaceLogo$`).
   */
  uploadLogo(uuid: string, file: File): Observable<Bitstream> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Bitstream>(
      `${DSPACE_API_BASE}${COLLECTIONS_PATH}/${uuid}/logo`,
      form,
    );
  }
}
