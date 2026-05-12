import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Bundle, BundlesResponse } from './models/search.model';
import { Bitstream } from './models/bitstream.model';
import { HalListResponse } from './models/hal.model';
import { DSPACE_API_BASE, BUNDLES_PATH, BITSTREAMS_PATH, ITEMS_PATH } from './dspace-rest.util';

/**
 * Wrapper HTTP de los recursos `/api/core/items/{uuid}/bundles` y
 * `/api/core/bundles/{uuid}/bitstreams` de DSpace 9.x.
 *
 * Lo necesita el SubmissionFacade post-archive para colocar la portada
 * manual del item en el bundle THUMBNAIL. La submission API solo soporta
 * upload al bundle ORIGINAL, así que la portada se sube directo a core/bundles.
 */
@Injectable({ providedIn: 'root' })
export class BundleApiService {
  private readonly http = inject(HttpClient);

  /** Lista los bundles del item (ORIGINAL, THUMBNAIL, LICENSE, etc.). */
  listForItem(itemUuid: string): Observable<BundlesResponse> {
    return this.http.get<BundlesResponse>(
      `${DSPACE_API_BASE}${ITEMS_PATH}/${itemUuid}/bundles`,
    );
  }

  /**
   * Crea un bundle dentro del item. DSpace devuelve 201 con el bundle creado
   * (o 400 si ya existe un bundle con el mismo `name`). El body debe llevar
   * `metadata: {}` aunque sea vacío para que el backend lo acepte.
   */
  createBundle(itemUuid: string, name: string): Observable<Bundle> {
    return this.http.post<Bundle>(
      `${DSPACE_API_BASE}${ITEMS_PATH}/${itemUuid}/bundles`,
      { name, metadata: {} },
    );
  }

  /** Lista los bitstreams de un bundle (THUMBNAIL, ORIGINAL, etc.). */
  listBitstreams(bundleUuid: string): Observable<Bitstream[]> {
    return this.http
      .get<HalListResponse<Bitstream>>(
        `${DSPACE_API_BASE}${BUNDLES_PATH}/${bundleUuid}/bitstreams`,
      )
      .pipe(map((res) => res._embedded?.['bitstreams'] ?? []));
  }

  /** Borra un bitstream del repositorio. */
  deleteBitstream(bitstreamUuid: string): Observable<void> {
    return this.http.delete<void>(
      `${DSPACE_API_BASE}${BITSTREAMS_PATH}/${bitstreamUuid}`,
    );
  }

  /**
   * Sube un bitstream al bundle. Multipart con el archivo en el field `file`.
   * No setear Content-Type ni Content-Length manualmente: HttpClient arma el
   * `multipart/form-data` con el boundary correcto cuando recibe un FormData.
   */
  uploadBitstream(bundleUuid: string, file: File): Observable<Bitstream> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Bitstream>(
      `${DSPACE_API_BASE}${BUNDLES_PATH}/${bundleUuid}/bitstreams`,
      form,
    );
  }
}
