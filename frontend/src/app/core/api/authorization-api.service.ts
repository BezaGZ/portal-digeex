import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { DSPACE_API_BASE } from './dspace-rest.util';
import { FeatureId } from './models/feature-id';
import { SiteApiService } from './site-api.service';

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
  private readonly siteApi = inject(SiteApiService);

  /**
   * Self del Site, resuelto una vez y compartido. El endpoint `search/object`
   * exige `uri` (backend `findByObject`, required=true): no existe un "asumir el
   * Site". Para features site-scoped, dspace-angular resuelve el Site en el
   * front (`AuthorizationDataService.searchByObject` → `siteService.find()` →
   * `site.self`); esto lo espeja. `refCount` deja que las features de una misma
   * navegación compartan un solo GET y que un fallo no quede cacheado para siempre.
   */
  private readonly siteSelf$ = this.siteApi.getSiteRoot$().pipe(
    map((site) => site?._links?.self?.href ?? null),
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * ¿El usuario del token puede ejercer `feature` sobre el objeto cuyo self
   * absoluto es `objectUrl`? Se pasa `feature` para que el backend filtre, así
   * basta con que la lista de authorizations venga no vacía. Sin `objectUrl` se
   * resuelve el self del Site y se manda como `uri` (features site-scoped),
   * porque el backend lo exige; no lo asume. Se omite `eperson` para que el
   * backend use el usuario del token; solo se manda para chequear por otro
   * (caso admin). Un 401 o error de red resuelve a `false`, nunca a excepción.
   */
  isAuthorized(feature: FeatureId, objectUrl?: string, ePersonUuid?: string): Observable<boolean> {
    const objectUrl$ = objectUrl ? of(objectUrl) : this.siteSelf$;
    return objectUrl$.pipe(
      switchMap((uri) => {
        let params = new HttpParams().set('feature', feature);
        if (uri) {
          params = params.set('uri', uri);
        }
        if (ePersonUuid) {
          params = params.set('eperson', ePersonUuid);
        }
        return this.http.get<AuthorizationsResponse>(AUTHORIZATIONS_SEARCH_OBJECT, { params });
      }),
      map((response) => (response._embedded?.authorizations?.length ?? 0) > 0),
      catchError(() => of(false)),
    );
  }
}
