import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Community, CommunityCreateBody } from './models/community.model';
import { Group, AssociatedGroupCreateBody } from './models/group.model';
import { HalListResponse } from './models/hal.model';
import { COMMUNITIES_PATH, DSPACE_API_BASE, paginateAll$ } from './dspace-rest.util';
import { JsonPatchEntry } from './json-patch.util';

/**
 * Wrapper HTTP del recurso `/api/core/communities` de DSpace.
 *
 * Expone el listado top-level (`list`), una community por UUID con embed
 * opcional para subrecursos como `adminGroup` (`getOne`), y el listado de
 * sub-comunidades de una community padre (`listSubcommunities`).
 */
@Injectable({ providedIn: 'root' })
export class CommunityApiService {
  private readonly http = inject(HttpClient);

  /** Lista paginada de comunidades top-level del repositorio. */
  list(page = 0, size = 20): Observable<HalListResponse<Community>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<HalListResponse<Community>>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}`,
      { params },
    );
  }

  /**
   * Comunidades sin parent (raíces del repositorio). En DIGEEX hay solo una
   * (la community DIGEEX), pero el endpoint sigue siendo paginado por contrato.
   */
  searchTop(page = 0, size = 20): Observable<HalListResponse<Community>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<HalListResponse<Community>>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/search/top`,
      { params },
    );
  }

  /**
   * Obtiene una comunidad por UUID. `embed` proyecta subrecursos en la
   * misma respuesta (por ejemplo `adminGroup` para resolver el grupo
   * destino al crear un admin_subdireccion).
   */
  getOne(uuid: string, options: { embed?: string } = {}): Observable<Community> {
    let params = new HttpParams();
    if (options.embed) {
      params = params.set('embed', options.embed);
    }
    return this.http.get<Community>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${uuid}`,
      { params },
    );
  }

  /** Sub-comunidades de una community padre. */
  listSubcommunities(
    parentUuid: string,
    page = 0,
    size = 20,
  ): Observable<HalListResponse<Community>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<HalListResponse<Community>>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${parentUuid}/subcommunities`,
      { params },
    );
  }

  /**
   * Materializa TODAS las sub-comunidades de una community padre agotando
   * páginas con `paginateAll$` sin imponer `size` desde el frontend. Mismo
   * patrón que `VocabularyApiService.getEntries`: el backend usa su default
   * configurado (`spring.data.rest.default-page-size`).
   */
  listAllSubcommunities(parentUuid: string): Observable<Community[]> {
    return paginateAll$(
      (page) => this.fetchSubcommunitiesPage$(parentUuid, page),
      (resp) =>
        (resp._embedded as Record<string, Community[] | undefined>)?.['subcommunities'] ?? [],
    );
  }

  /**
   * Fetch interno de una página de sub-comunidades. La primera página
   * (page=0) no manda parámetros para que DSpace aplique su default; las
   * siguientes solo mandan `page`. Reflejo exacto de `VocabularyApiService`.
   */
  private fetchSubcommunitiesPage$(
    parentUuid: string,
    page: number,
  ): Observable<HalListResponse<Community>> {
    const url = `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${parentUuid}/subcommunities`;
    return page === 0
      ? this.http.get<HalListResponse<Community>>(url)
      : this.http.get<HalListResponse<Community>>(url, {
          params: new HttpParams().set('page', String(page)),
        });
  }

  /**
   * Crea una community. Si `parentUuid` viene, se manda en query como `parent`
   * y DSpace la cuelga como sub-comunidad de esa community padre; si no, la
   * crea como top-level. Mismo endpoint y mismo shape de respuesta en ambos
   * casos: el único delta es el query param. El CSRF token y el JWT los
   * inyectan los interceptores sobre toda mutación.
   */
  create(body: CommunityCreateBody, parentUuid?: string): Observable<Community> {
    let params = new HttpParams();
    if (parentUuid) {
      params = params.set('parent', parentUuid);
    }
    return this.http.post<Community>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}`,
      body,
      { params },
    );
  }

  /**
   * Aplica un parche JSON sobre la community y devuelve el recurso completo
   * actualizado. El body es un arreglo de operaciones JSON Patch (RFC 6902);
   * los helpers `replaceOp`, `addOp` y `removeOp` de `json-patch.util` arman
   * cada entrada sin que el caller tenga que repetir la estructura.
   */
  updateMetadata(uuid: string, patch: JsonPatchEntry[]): Observable<Community> {
    return this.http.patch<Community>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${uuid}`,
      patch,
    );
  }

  /**
   * Borra una community por UUID. DSpace responde 204 sin body en caso de
   * éxito; el wrapper expone `Observable<void>` para reflejar esa semántica
   * y forzar al caller a manejar solo error/complete (no payload).
   */
  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${uuid}`,
    );
  }

  /**
   * Crea el adminGroup asociado a la community indicada. DSpace lo nombra
   * automáticamente (`COMMUNITY_<uuid>_ADMIN`) — el contrato 9.x prohíbe
   * fijar nombre en este endpoint, por eso el body solo lleva metadata
   * opcional. El facade de Bloque 1 hace este POST y luego renombra el
   * Group resultante a `ADMIN_<sufijo>` con `GroupApiService.updateMetadata`.
   * DSpace devuelve 422 si la community ya tiene adminGroup.
   */
  createAdminGroup(communityUuid: string, body: AssociatedGroupCreateBody = {}): Observable<Group> {
    return this.http.post<Group>(
      `${DSPACE_API_BASE}${COMMUNITIES_PATH}/${communityUuid}/adminGroup`,
      body,
    );
  }
}
