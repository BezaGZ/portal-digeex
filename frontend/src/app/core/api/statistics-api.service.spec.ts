import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { StatisticsApiService } from './statistics-api.service';

/**
 * Tests del `StatisticsApiService`.
 *
 * Wrapper de lectura del módulo Solr Statistics. Cubre el GET a
 * `/api/statistics/usagereports/{uuid}_{reportType}` para item/collection y
 * el GET a `/api/statistics/usagereports/search/object?uri=<siteHref>` para
 * la vista global del Site (que el endpoint single no resuelve como ranking
 * de items, sino como contador del propio Site). La respuesta llega tal
 * cual viene del backend y el modelo `UsageReport` la consume sin pegado.
 *
 * Ciclo 23 TDD — Sprint 8. Ajustado en Ciclo 22 (Sprint 9).
 */
describe('StatisticsApiService', () => {
  let service: StatisticsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), StatisticsApiService],
    });
    service = TestBed.inject(StatisticsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Verifica que getReport$ pegue al endpoint single con el UUID y reportType correctos y devuelva el body sin transformar. */
  it('should GET /usagereports/{uuid}_TotalVisits and map the response', () => {
    let received: unknown;
    service.getReport$('uuid-1', 'TotalVisits').subscribe((r) => (received = r));

    const req = httpMock.expectOne('/server/api/statistics/usagereports/uuid-1_TotalVisits');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'uuid-1_TotalVisits',
      reportType: 'TotalVisits',
      points: [
        { id: 'p1', label: 'Album A', values: { views: 12 } },
        { id: 'p2', label: 'Album B', values: { views: 7 } },
      ],
    });

    expect(received).toEqual({
      id: 'uuid-1_TotalVisits',
      reportType: 'TotalVisits',
      points: [
        { id: 'p1', label: 'Album A', values: { views: 12 } },
        { id: 'p2', label: 'Album B', values: { views: 7 } },
      ],
    });
  });

  /** Verifica que el método arme el path concatenando uuid + reportType para los 5 valores válidos de UsageReportType. */
  it('should call the correct url for each report type', () => {
    const types = ['TotalVisits', 'TotalVisitsPerMonth', 'TotalDownloads', 'TopCountries', 'TopCities'] as const;
    for (const t of types) {
      service.getReport$('uuid-x', t).subscribe();
      const req = httpMock.expectOne(`/server/api/statistics/usagereports/uuid-x_${t}`);
      expect(req.request.method).toBe('GET');
      req.flush({ id: `uuid-x_${t}`, reportType: t, points: [] });
    }
  });

  /** Verifica que cuando el backend devuelve points vacío el caller reciba el report intacto con points=[]. */
  it('should return a report with empty points array when backend returns no data', () => {
    let received: { points: unknown[] } | undefined;
    service
      .getReport$('uuid-empty', 'TotalDownloads')
      .subscribe((r) => (received = r as { points: unknown[] }));

    httpMock
      .expectOne('/server/api/statistics/usagereports/uuid-empty_TotalDownloads')
      .flush({ id: 'uuid-empty_TotalDownloads', reportType: 'TotalDownloads', points: [] });

    expect(received?.points).toEqual([]);
  });

  /**
   * Verifica que errores HTTP se propaguen sin envolver.
   * El container muestra empty/error state según el reportType; el service no decide UX.
   */
  it('should propagate HTTP errors (no swallow)', () => {
    let errored = false;
    service.getReport$('uuid-err', 'TotalVisits').subscribe({
      next: () => {},
      error: () => (errored = true),
    });

    httpMock
      .expectOne('/server/api/statistics/usagereports/uuid-err_TotalVisits')
      .flush('Not found', { status: 404, statusText: 'Not Found' });

    expect(errored).toBe(true);
  });

  /**
   * Verifica que getReportsForSite$ use el endpoint search/object con el href encoded del Site.
   * El endpoint single devolvería el contador propio del Site (siempre cero); search/object resuelve el top items globales del repo.
   */
  it('should GET /usagereports/search/object?uri=<encoded href> for the Site', () => {
    let received: unknown;
    const siteHref = 'http://localhost:8080/server/api/core/sites/site-uuid';
    service.getReportsForSite$(siteHref).subscribe((r) => (received = r));

    const encoded = encodeURIComponent(siteHref);
    const req = httpMock.expectOne(
      `/server/api/statistics/usagereports/search/object?uri=${encoded}`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      _embedded: {
        usagereports: [
          {
            id: 'site-uuid_TotalVisits',
            // DSpace serializa el tipo como `report-type` (con guion), no `reportType`.
            'report-type': 'TotalVisits',
            points: [{ id: 'i1', label: 'Item A', values: { views: 7 } }],
          },
        ],
      },
    });

    expect(Array.isArray(received)).toBe(true);
    expect((received as unknown[]).length).toBe(1);
    // El service normaliza `report-type` a `reportType` para el container.
    expect((received as { reportType: string }[])[0].reportType).toBe('TotalVisits');
  });

  /** Verifica que falta el _embedded.usagereports en la respuesta degrade a array vacío sin romper el caller. */
  it('should return empty array when Site has no embedded usagereports', () => {
    let received: unknown;
    service.getReportsForSite$('http://x/sites/u').subscribe((r) => (received = r));

    httpMock
      .expectOne(`/server/api/statistics/usagereports/search/object?uri=${encodeURIComponent('http://x/sites/u')}`)
      .flush({});

    expect(received).toEqual([]);
  });
});
