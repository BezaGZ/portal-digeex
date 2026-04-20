import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EPerson, Paginated } from '../models/eperson.model';

/**
 * Respuesta cruda del endpoint GET /api/eperson/epersons de DSpace.
 * Se mantiene privada al archivo porque solo interesa para hacer
 * el mapeo al modelo limpio Paginated<EPerson>.
 */
interface DSpaceEPersonsResponse {
  _embedded?: {
    epersons?: EPerson[];
  };
  page: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
  };
}

/**
 * Wrapper HTTP del recurso /api/eperson/epersons de DSpace.
 * Solo habla con el backend: no aplica reglas de negocio ni mapea a modelos de UI.
 *
 */
@Injectable({ providedIn: 'root' })
export class EPersonApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/server/api';

  /**
   * Lista epersons paginados desde DSpace.
   * @param params Paginación (size y page, 0-indexed).
   */
  list(params: { size?: number; page?: number } = {}): Observable<Paginated<EPerson>> {
    let httpParams = new HttpParams();

    if (params.size !== undefined) {
      httpParams = httpParams.set('size', String(params.size));
    }

    if (params.page !== undefined) {
      httpParams = httpParams.set('page', String(params.page));
    }

    return this.http
      .get<DSpaceEPersonsResponse>(`${this.apiUrl}/eperson/epersons`, { params: httpParams })
      .pipe(
        map((response) => ({
          items: response._embedded?.epersons ?? [],
          totalElements: response.page.totalElements,
          totalPages: response.page.totalPages,
          size: response.page.size,
          page: response.page.number,
        })),
      );
  }
}
