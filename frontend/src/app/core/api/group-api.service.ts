import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EPerson } from './models/eperson.model';
import { Group, GroupCreateBody } from './models/group.model';
import { Paginated, HalListResponse } from './models/hal.model';
import { JsonPatchEntry } from './json-patch.util';
import {
  DSPACE_API_BASE,
  EMBEDDED_KEY_EPERSONS,
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
const GROUP_SUBGROUPS_SUBRESOURCE = 'subgroups';

/** Endpoint nativo de DSpace para buscar grupos por nombre/metadata. */
const GROUPS_SEARCH_BY_METADATA_PATH = `${GROUPS_COLLECTION_PATH}/search/byMetadata`;

/** Nombre del grupo global de superadministradores en DSpace (RN-07). */
const ADMINISTRATOR_GROUP_NAME = 'Administrator';

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

  /**
   * Devuelve los epersons miembros del grupo indicado. Se usa al desactivar
   * un superadmin para contar cuántos siguen activos y proteger RN-11 sin
   * depender de un contador en cliente.
   */
  getMembersOfGroup(
    groupUuid: string,
    params: { size?: number; page?: number } = {},
  ): Observable<Paginated<EPerson>> {
    const url = `${DSPACE_API_BASE}${GROUPS_COLLECTION_PATH}/${groupUuid}/${GROUP_EPERSONS_SUBRESOURCE}`;

    return this.http
      .get<HalListResponse<EPerson>>(url, { params: buildPaginationParams(params) })
      .pipe(map((response) => mapHalList(response, EMBEDDED_KEY_EPERSONS)));
  }

  /**
   * Lista paginada de grupos del recurso /api/eperson/groups. Usado por el
   * diálogo de alta para poblar el dropdown de roles con los grupos reales
   * que viven en DSpace, sin hardcodear nombres del lado cliente.
   */
  listGroups(params: { size?: number; page?: number } = {}): Observable<Paginated<Group>> {
    const url = `${DSPACE_API_BASE}${GROUPS_COLLECTION_PATH}`;
    return this.http
      .get<HalListResponse<Group>>(url, { params: buildPaginationParams(params) })
      .pipe(map((response) => mapHalList(response, EMBEDDED_KEY_GROUPS)));
  }

  /**
   * Resuelve un grupo por su nombre exacto vía el endpoint nativo de
   * búsqueda por metadata. DSpace 9.x hace `byMetadata` con LIKE sobre
   * UUID y nombre, por lo que puede devolver más de un grupo cuyo nombre
   * empieza por el mismo prefijo; se filtra en código para quedarse con
   * el match exacto y se lanza error si no aparece. Lo consumen tanto el
   * resolver del grupo Administrator (RN-07) como los facades del Bloque 1
   * que necesitan resolver `SUBMITTERS_<sufijo>` para enlazarlo a las
   * collections nuevas (Camino B / Opción 3 — ver bitácora 3.5).
   */
  getByName(name: string): Observable<Group> {
    const url = `${DSPACE_API_BASE}${GROUPS_SEARCH_BY_METADATA_PATH}`;
    const params = new HttpParams().set('query', name);

    return this.http.get<HalListResponse<Group>>(url, { params }).pipe(
      map((response) => {
        const groups = response._embedded?.[EMBEDDED_KEY_GROUPS] ?? [];
        const exact = groups.find((group) => group.name === name);
        if (!exact) {
          throw new Error(`Grupo ${name} no encontrado`);
        }
        return exact;
      }),
    );
  }

  /** Atajo para el grupo global Administrator (RN-07). */
  findAdministratorGroup(): Observable<Group> {
    return this.getByName(ADMINISTRATOR_GROUP_NAME);
  }

  /**
   * Crea un grupo standalone con nombre custom. Único endpoint del contrato
   * 9.x que permite fijar el `name` en el POST; lo usa el `CommunityFacade`
   * para crear `SUBMITTERS_<sufijo>` al alta de subcomunidad. El campo
   * `permanent` no se envía (DSpace lo asigna como false; enviarlo en true
   * provoca 422).
   */
  create(body: GroupCreateBody): Observable<Group> {
    const url = `${DSPACE_API_BASE}${GROUPS_COLLECTION_PATH}`;
    return this.http.post<Group>(url, body);
  }

  /**
   * Aplica un parche JSON sobre el grupo y devuelve el recurso completo
   * actualizado. El uso principal es renombrar el `adminGroup` que DSpace
   * crea auto-nombrado al hacer `POST /communities/{uuid}/adminGroup`,
   * convirtiéndolo a `ADMIN_<sufijo>` con `replaceOp('/name', ...)`.
   */
  updateMetadata(uuid: string, patch: JsonPatchEntry[]): Observable<Group> {
    const url = `${DSPACE_API_BASE}${GROUPS_COLLECTION_PATH}/${uuid}`;
    return this.http.patch<Group>(url, patch);
  }

  /**
   * Agrega un grupo existente como subgrupo del grupo padre. El body es
   * la URI absoluta del subgrupo con `Content-Type: text/uri-list`, igual
   * patrón que `addMemberToGroup`. Lo usa `CollectionFacade.create` para
   * enlazar `SUBMITTERS_<sufijo>` como subgrupo del submittersGroup
   * técnico que DSpace auto-genera al crear la collection. DSpace responde
   * 204 No Content por eso devuelve `Observable<void>`.
   */
  addSubgroup(parentUuid: string, subgroupUri: string): Observable<void> {
    const url = `${DSPACE_API_BASE}${GROUPS_COLLECTION_PATH}/${parentUuid}/${GROUP_SUBGROUPS_SUBRESOURCE}`;
    const headers = new HttpHeaders({ 'Content-Type': URI_LIST_CONTENT_TYPE });

    return this.http.post<void>(url, subgroupUri, { headers });
  }
}
