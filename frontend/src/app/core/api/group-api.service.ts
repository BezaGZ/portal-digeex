import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Group } from './models/group.model';
import { Paginated, HalListResponse } from './models/hal.model';
import {
  DSPACE_API_BASE,
  EMBEDDED_KEY_GROUPS,
  EPERSONS_COLLECTION_PATH,
  GROUPS_COLLECTION_PATH,
  URI_LIST_CONTENT_TYPE,
  buildAbsoluteApiUrl,
  buildPaginationParams,
  mapHalList,
} from './dspace-rest.util';

/** Subrecursos del contrato DSpace 9.2 usados por este wrapper. */
const EPERSON_GROUPS_SUBRESOURCE = 'groups';
const GROUP_EPERSONS_SUBRESOURCE = 'epersons';

/**
 * Wrapper HTTP del recurso /api/eperson/groups y del subrecurso
 * /api/eperson/epersons/{uuid}/groups de DSpace 9.2.
 *
 * Solo habla con el backend, sin reglas de negocio: la lógica de qué
 * grupos puede modificar cada rol vive en UserManagementService.
 */
@Injectable({ providedIn: 'root' })
export class GroupApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lista los grupos a los que pertenece un eperson.
   * Usa el subrecurso groups declarado con @LinkRest en EPersonRest.java;
   * DSpace ya incluye los grupos heredados por pertenencia a subgrupos.
   */
  getGroupsOfEPerson(
    epersonUuid: string,
    params: { size?: number; page?: number } = {},
  ): Observable<Paginated<Group>> {
    const url = `${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}/${epersonUuid}/${EPERSON_GROUPS_SUBRESOURCE}`;

    return this.http
      .get<HalListResponse<Group>>(url, { params: buildPaginationParams(params) })
      .pipe(map((response) => mapHalList(response, EMBEDDED_KEY_GROUPS)));
  }

  /**
   * Asigna un eperson como miembro de un grupo.
   * DSpace exige el contenido como text/uri-list con la URL absoluta del
   * eperson dentro del body, según el contrato REST oficial. El wrapper
   * construye el URI usando window.location.origin para que el facade no
   * tenga que conocer el detalle del formato.
   */
  addMemberToGroup(groupUuid: string, epersonUuid: string): Observable<Group> {
    const url = `${DSPACE_API_BASE}${GROUPS_COLLECTION_PATH}/${groupUuid}/${GROUP_EPERSONS_SUBRESOURCE}`;
    const epersonUri = buildAbsoluteApiUrl(`${EPERSONS_COLLECTION_PATH}/${epersonUuid}`);
    const headers = new HttpHeaders({ 'Content-Type': URI_LIST_CONTENT_TYPE });

    return this.http.post<Group>(url, epersonUri, { headers });
  }

  /**
   * Retira a un eperson del grupo indicado.
   * DSpace responde 204 No Content en éxito, por eso el Observable emite void.
   */
  removeMemberFromGroup(groupUuid: string, epersonUuid: string): Observable<void> {
    const url = `${DSPACE_API_BASE}${GROUPS_COLLECTION_PATH}/${groupUuid}/${GROUP_EPERSONS_SUBRESOURCE}/${epersonUuid}`;

    return this.http.delete<void>(url);
  }
}
