import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DSPACE_API_BASE } from './dspace-rest.util';
import { FeatureId } from './models/feature-id';

/** Endpoint nativo de autorización por objeto del contrato REST de DSpace 9.x. */
const AUTHORIZATIONS_SEARCH_OBJECT = `${DSPACE_API_BASE}/authz/authorizations/search/object`;

/** Respuesta HAL del endpoint: solo importa si el array embebido viene o no vacío. */
interface AuthorizationsResponse {
  _embedded?: { authorizations?: unknown[] };
}

/**
 * Wrapper del endpoint nativo `/api/authz/authorizations/search/object` de
 * DSpace 9.x. Reemplaza la heurística del sufijo del frontend por el chequeo
 * nativo por objeto: pregunta al backend si el usuario del token puede ejercer
 * una feature sobre un objeto concreto.
 */
@Injectable({ providedIn: 'root' })
export class AuthorizationApiService {
  private readonly http = inject(HttpClient);

  /**
   * ¿El usuario del token puede ejercer `feature` sobre el objeto cuyo self
   * absoluto es `objectUrl`? Se pasa `feature` para que el backend filtre, así
   * basta con que la lista de authorizations venga no vacía. Sin `objectUrl` el
   * backend asume el Site (features site-scoped). Se omite `eperson` para que el
   * backend use el usuario del token; solo se manda para chequear por otro
   * (caso admin). Un 401 o error de red resuelve a `false`, nunca a excepción.
   */
  isAuthorized(feature: FeatureId, objectUrl?: string, ePersonUuid?: string): Observable<boolean> {
    let params = new HttpParams().set('feature', feature);
    if (objectUrl) {
      params = params.set('uri', objectUrl);
    }
    if (ePersonUuid) {
      params = params.set('eperson', ePersonUuid);
    }

    return this.http.get<AuthorizationsResponse>(AUTHORIZATIONS_SEARCH_OBJECT, { params }).pipe(
      map((response) => (response._embedded?.authorizations?.length ?? 0) > 0),
      catchError(() => of(false)),
    );
  }
}
