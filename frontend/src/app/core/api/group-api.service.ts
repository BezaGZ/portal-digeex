import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Group } from './models/group.model';
import { HalListResponse, Paginated } from './models/hal.model';

/**
 * Wrapper HTTP del recurso /api/eperson/groups y del subrecurso
 * /api/eperson/epersons/{uuid}/groups de DSpace 9.2.
 *
 * Solo habla con el backend, sin reglas de negocio: la lógica de qué
 * grupos puede modificar cada rol vive en UserManagementService.
 *
 */
@Injectable({ providedIn: 'root' })
export class GroupApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/server/api';

  /**
   * Lista los grupos a los que pertenece un eperson.
   * Usa el subrecurso groups declarado con @LinkRest en EPersonRest.java;
   * DSpace ya incluye los grupos heredados por pertenencia a subgrupos.
   */
  getGroupsOfEPerson(
    epersonUuid: string,
    params: { size?: number; page?: number } = {},
  ): Observable<Paginated<Group>> {
    const httpParams = this.buildHttpParams(params);

    return this.http
      .get<HalListResponse<Group>>(
        `${this.apiUrl}/eperson/epersons/${epersonUuid}/groups`,
        { params: httpParams },
      )
      .pipe(map((response) => this.mapResponse(response)));
  }

  /**
   * Asigna un eperson como miembro de un grupo.
   * DSpace exige el contenido como text/uri-list con la URL absoluta del
   * eperson dentro del body, según el contrato REST oficial. El wrapper
   * construye el URI usando window.location.origin para que el facade no
   * tenga que conocer el detalle del formato.
   */
  addMemberToGroup(groupUuid: string, epersonUuid: string): Observable<Group> {
    const headers = new HttpHeaders({ 'Content-Type': 'text/uri-list' });
    const epersonUri = `${window.location.origin}${this.apiUrl}/eperson/epersons/${epersonUuid}`;

    return this.http.post<Group>(
      `${this.apiUrl}/eperson/groups/${groupUuid}/epersons`,
      epersonUri,
      { headers },
    );
  }

  /**
   * Retira a un eperson del grupo indicado.
   * DSpace responde 204 No Content en éxito, por eso el Observable emite void.
   */
  removeMemberFromGroup(groupUuid: string, epersonUuid: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/eperson/groups/${groupUuid}/epersons/${epersonUuid}`,
    );
  }

  /**
   * Arma HttpParams agregando solo los valores que vinieron definidos.
   * Así evitamos mandar size=undefined o page=undefined al backend.
   */
  private buildHttpParams(params: { size?: number; page?: number }): HttpParams {
    let httpParams = new HttpParams();

    if (params.size !== undefined) {
      httpParams = httpParams.set('size', String(params.size));
    }

    if (params.page !== undefined) {
      httpParams = httpParams.set('page', String(params.page));
    }

    return httpParams;
  }

  /**
   * Aplana la respuesta HAL de DSpace a Paginated<Group>.
   * `page.number` se expone como `page` para que el frontend no tenga
   * que conocer la nomenclatura HAL.
   */
  private mapResponse(response: HalListResponse<Group>): Paginated<Group> {
    return {
      items: response._embedded?.['groups'] ?? [],
      totalElements: response.page.totalElements,
      totalPages: response.page.totalPages,
      size: response.page.size,
      page: response.page.number,
    };
  }
}
