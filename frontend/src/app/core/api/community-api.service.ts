import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Community } from './models/community.model';
import { HalListResponse } from './models/hal.model';
import { DSPACE_API_BASE, COMMUNITIES_PATH } from './dspace-rest.util';

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
}
