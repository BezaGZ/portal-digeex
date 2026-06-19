import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DSPACE_API_BASE } from './dspace-rest.util';
import { UsageReport, UsageReportType } from './models/usage-report.model';

/**
 * Wrapper de lectura del módulo Solr Statistics de DSpace 9.x. Cada llamada
 * pega a `/api/statistics/usagereports/{dsoUuid}_{reportType}` y devuelve el
 * `UsageReport` normalizado tal cual viene del backend (los `points` están
 * ya ordenados por el `UsageReportUtils` server-side, sin paginación). La
 * lectura de los reportes es independiente del registro: visitas se escriben
 * vía `StatisticsTrackingService` y descargas se escriben automáticamente
 * desde el backend al servir el bitstream.
 *
 * Errores HTTP (404 por reportType inválido, 422 por UUID inexistente) se
 * propagan sin envolver para que el container pueda mostrar el empty state
 * o el mensaje de error adecuado.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/endpoints.md
 */
/**
 * Shape mínimo del wrapper HAL que devuelve el endpoint search/object. DSpace
 * serializa el tipo del reporte como `report-type` (con guion), no `reportType`.
 */
interface SiteUsageReportsResponse {
  _embedded?: { usagereports?: Array<UsageReport & { 'report-type'?: string }> };
}

@Injectable({ providedIn: 'root' })
export class StatisticsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lee un reporte específico del DSO. El backend devuelve un único objeto
   * `UsageReport` con su `points`; el frontend no pagina ni filtra acá.
   */
  getReport$(dsoUuid: string, reportType: UsageReportType): Observable<UsageReport> {
    return this.http.get<UsageReport>(
      `${DSPACE_API_BASE}/statistics/usagereports/${dsoUuid}_${reportType}`,
    );
  }

  /**
   * Lee los reportes globales del Site. A diferencia del endpoint single
   * (`{uuid}_TotalVisits`) que solo devuelve el contador del propio Site
   * (que nadie incrementa), `search/object` con el href del Site devuelve
   * el ranking real de items más vistos del repositorio entero. Es el
   * mismo endpoint que dspace-angular nativo usa en `SiteStatisticsPage`.
   *
   * @param siteHref href absoluto del Site root (`{base}/core/sites/{uuid}`).
   *                 Se toma del `_links.self.href` del response de
   *                 `/core/sites` para no asumir el host del backend.
   */
  getReportsForSite$(siteHref: string): Observable<UsageReport[]> {
    const url = `${DSPACE_API_BASE}/statistics/usagereports/search/object?uri=${encodeURIComponent(siteHref)}`;
    return this.http.get<SiteUsageReportsResponse>(url).pipe(
      map((r) =>
        (r._embedded?.usagereports ?? []).map((u) => ({
          ...u,
          // Normaliza `report-type` (con guion, como lo serializa DSpace) a
          // `reportType` para que el container resuelva título y renderer.
          reportType: (u['report-type'] ?? u.reportType) as UsageReportType,
        })),
      ),
    );
  }
}
