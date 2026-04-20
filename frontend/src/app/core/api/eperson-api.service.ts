import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EPerson } from './models/eperson.model';
import { HalListResponse, Paginated } from './models/hal.model';

/**
 * Servicio dedicado al recurso /api/eperson/epersons de DSpace.
 * Sigue el patrón de `DiscoveryService`: un servicio por recurso
 * en `core/api/`, con una sola razón de cambio.
 *
 * Responsabilidad: hablar el idioma del backend. No aplica reglas
 * de negocio ni mapea a modelos de UI — eso lo hace la fachada
 * de feature (`UserManagementService`).
 */
@Injectable({ providedIn: 'root' })
export class EPersonApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/server/api';

  /**
   * Lista epersons paginados desde DSpace.
   * @param params Paginación (size y page, 0-indexed).
   * @returns Respuesta aplanada en `Paginated<EPerson>`.
   */
  list(params: { size?: number; page?: number } = {}): Observable<Paginated<EPerson>> {
    const httpParams = this.buildHttpParams(params);

    return this.http
      .get<HalListResponse<EPerson>>(`${this.apiUrl}/eperson/epersons`, { params: httpParams })
      .pipe(map((response) => this.mapResponse(response)));
  }

  /**
   * Construye los HttpParams solo con los valores definidos,
   * para no enviar `size=undefined` o `page=undefined` al backend.
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
   * Aplana la respuesta HAL de DSpace a `Paginated<EPerson>`.
   * `_embedded.epersons` es el arreglo real de usuarios;
   * `page.number` se expone como `page` para que el frontend
   * no tenga que conocer la nomenclatura de HAL.
   */
  private mapResponse(response: HalListResponse<EPerson>): Paginated<EPerson> {
    return {
      items: response._embedded?.['epersons'] ?? [],
      totalElements: response.page.totalElements,
      totalPages: response.page.totalPages,
      size: response.page.size,
      page: response.page.number,
    };
  }
}
