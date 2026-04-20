import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { EPerson } from './models/eperson.model';
import { HalListResponse, Paginated } from './models/hal.model';

/** Paths relativos al apiUrl base de DSpace. */
const EPERSONS_PATH = '/eperson/epersons';
const REGISTRATIONS_PATH = '/eperson/registrations';

/** Valores fijos del contrato REST de DSpace. */
const ACCOUNT_REQUEST_FORGOT = 'forgot';
const EPERSON_TYPE = 'eperson';
const REGISTRATION_TYPE = 'registration';

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
      .get<HalListResponse<EPerson>>(`${this.apiUrl}${EPERSONS_PATH}`, { params: httpParams })
      .pipe(map((response) => this.mapResponse(response)));
  }

  /**
   * Crea un eperson y dispara un registration con accountRequestType=forgot
   * para que el usuario fije su contraseña desde el correo con token.
   * DSpace no acepta password en el POST directo, por eso van encadenados.
   */
  create(input: { email: string; firstName: string; lastName: string }): Observable<EPerson> {
    return this.http
      .post<EPerson>(`${this.apiUrl}${EPERSONS_PATH}`, this.buildEPersonBody(input))
      .pipe(
        switchMap((created) =>
          this.triggerPasswordSetupEmail(input.email).pipe(map(() => created)),
        ),
      );
  }

  /**
   * Construye el body que DSpace espera para crear un eperson.
   * Alineado al contrato REST oficial de /api/eperson/epersons.
   * No lleva password: eso lo fija el usuario desde el correo de registration.
   */
  private buildEPersonBody(input: { email: string; firstName: string; lastName: string }) {
    return {
      name: input.email,
      email: input.email,
      canLogIn: true,
      requireCertificate: false,
      selfRegistered: false,
      type: EPERSON_TYPE,
      metadata: {
        'eperson.firstname': [
          { value: input.firstName, language: null, authority: '', confidence: -1 },
        ],
        'eperson.lastname': [
          { value: input.lastName, language: null, authority: '', confidence: -1 },
        ],
      },
    };
  }

  /**
   * Dispara el correo de DSpace para que el usuario fije su contraseña.
   * Usa accountRequestType=forgot porque el eperson ya existe: register está
   * pensado para autoregistro desde el formulario público, nuestro caso no.
   */
  private triggerPasswordSetupEmail(email: string): Observable<unknown> {
    return this.http.post(
      `${this.apiUrl}${REGISTRATIONS_PATH}`,
      { email, type: REGISTRATION_TYPE },
      { params: new HttpParams().set('accountRequestType', ACCOUNT_REQUEST_FORGOT) },
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
