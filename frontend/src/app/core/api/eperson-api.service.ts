import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EPerson } from './models/eperson.model';
import { HalListResponse, Paginated } from './models/hal.model';

/**
 * Wrapper HTTP del recurso /api/eperson/epersons de DSpace.
 * Solo habla con el backend, sin reglas de negocio.
 * Ciclo 5, 6 TDD — Sprint 5.
 */
@Injectable({ providedIn: 'root' })
export class EPersonApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/server/api';

  /**
   * Lista epersons paginados desde DSpace.
   * Devuelve la respuesta aplanada en Paginated<EPerson>.
   */
  list(params: { size?: number; page?: number } = {}): Observable<Paginated<EPerson>> {
    const httpParams = this.buildHttpParams(params);

    return this.http
      .get<HalListResponse<EPerson>>(`${this.apiUrl}/eperson/epersons`, { params: httpParams })
      .pipe(map((response) => this.mapResponse(response)));
  }

  /**
   * Crea un eperson y dispara el registration para que fije su contraseña.
   * DSpace no acepta password en el POST directo, por eso van encadenados.
   */
  create(_input: { email: string; firstName: string; lastName: string }): Observable<EPerson> {
    throw new Error('EPersonApiService.create() no implementado');
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
   * Aplana la respuesta HAL de DSpace a Paginated<EPerson>.
   * `page.number` se expone como `page` para que el frontend
   * no tenga que conocer la nomenclatura HAL.
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
