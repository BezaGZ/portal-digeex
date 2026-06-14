import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';

import { DSPACE_API_BASE } from './dspace-rest.util';

/**
 * Tipo de DSO que se está registrando como visitado. DSpace 9 acepta los
 * cuatro tipos canónicos del modelo de contenido (`item`, `bitstream`,
 * `collection`, `community`); el portal solo emite los dos que tiene UI
 * pública: `item` (documentos, álbumes de galería, datasets de estadística)
 * y `collection` (programas).
 *
 * @see https://github.com/DSpace/RestContract/blob/main/statistics-viewevents.md
 */
export type TrackingTargetType = 'item' | 'collection';

/**
 * Registra visitas en el módulo Solr Statistics de DSpace 9.x vía POST a
 * `/api/statistics/viewevents`. DSpace no cuenta visitas automáticamente
 * cuando el frontend hace GET de un DSO; los UsageEvents de tipo `view` los
 * dispara explícitamente el cliente. Las descargas de bitstreams sí se
 * registran solas en el backend (vía SolrLoggerUsageEventListener) y no
 * requieren llamadas de este service.
 *
 * El POST se hace anónimo (sin Bearer): inflar las stats con sesión de
 * admin distorsiona los reportes. El xsrfInterceptor del proyecto agrega
 * automáticamente el header `X-XSRF-TOKEN` y `withCredentials: true`, así
 * que este service no maneja CSRF — solo arma el body y delega al HttpClient.
 *
 * El tracking es best-effort: si el endpoint responde con error (403, 422
 * por UUID inválido, 500), el observable emite `undefined` y completa sin
 * propagar. Una visita perdida no debe romper la UX de la página pública.
 */
@Injectable({ providedIn: 'root' })
export class StatisticsTrackingService {
  private readonly http = inject(HttpClient);

  /**
   * Registra una visita al DSO. Devuelve un observable que siempre emite
   * `undefined` y completa, tanto en éxito como en error.
   */
  trackView$(targetId: string, targetType: TrackingTargetType): Observable<void> {
    return this.http
      .post(`${DSPACE_API_BASE}/statistics/viewevents`, { targetId, targetType })
      .pipe(
        map(() => undefined),
        catchError(() => of(undefined)),
      );
  }
}
