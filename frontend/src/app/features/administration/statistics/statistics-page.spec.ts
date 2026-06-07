import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { StatisticsPage } from './statistics-page';
import { StatisticsApiService } from '../../../core/api/statistics-api.service';
import { UsageReport, UsageReportType } from './usage-report.model';

/**
 * Tests del container `StatisticsPage`.
 *
 * Container reusable montado en tres rutas (`/administrador/uso`,
 * `/administrador/uso/items/:uuid`, `/administrador/uso/programas/:uuid`).
 * Cubre los tres escenarios de scope (site, item, collection), el
 * descubrimiento del Site UUID + href vía HTTP cuando `dsoType === 'site'`,
 * y la resiliencia ante fallo de un report individual (los demás siguen
 * renderizando porque el `catchError` lo degrada a `null`).
 *
 * Ciclo 23 TDD — Sprint 8.
 */
describe('StatisticsPage', () => {
  let getReportFn: ReturnType<typeof vi.fn>;
  let getReportsForSiteFn: ReturnType<typeof vi.fn>;
  let httpMock: HttpTestingController;

  function buildReport(rt: UsageReportType, points: UsageReport['points']): UsageReport {
    return { id: `uuid_${rt}`, reportType: rt, points };
  }

  function setup(
    dsoType: 'site' | 'item' | 'collection',
    uuidParam: string | null,
  ): { fixture: ReturnType<typeof TestBed.createComponent<StatisticsPage>> } {
    TestBed.configureTestingModule({
      imports: [StatisticsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: StatisticsApiService,
          useValue: { getReport$: getReportFn, getReportsForSite$: getReportsForSiteFn },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ dsoType }),
            paramMap: of({ get: (k: string) => (k === 'uuid' ? uuidParam : null) }),
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StatisticsPage);
    return { fixture };
  }

  beforeEach(() => {
    getReportFn = vi.fn();
    getReportsForSiteFn = vi.fn();
  });

  afterEach(() => {
    httpMock?.verify();
  });

  /**
   * Verifica que scope=site descubra el siteHref vía /api/core/sites y llame al endpoint search/object.
   * No usa getReport$ porque el single sobre el Site devuelve el contador propio del Site (siempre cero).
   */
  it('should call getReportsForSite$ with the discovered Site href for site scope', async () => {
    getReportsForSiteFn.mockReturnValue(of([buildReport('TotalVisits', [])]));
    const { fixture } = setup('site', null);
    fixture.detectChanges();

    const req = httpMock.expectOne('/server/api/core/sites');
    req.flush({
      _embedded: {
        sites: [
          {
            uuid: 'site-root-uuid',
            _links: { self: { href: 'http://test/server/api/core/sites/site-root-uuid' } },
          },
        ],
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getReportsForSiteFn).toHaveBeenCalledTimes(1);
    expect(getReportsForSiteFn).toHaveBeenCalledWith('http://test/server/api/core/sites/site-root-uuid');
    expect(getReportFn).not.toHaveBeenCalled();
  });

  /** Verifica que scope=item dispare los 3 reports declarados en REPORTS_BY_DSO_TYPE['item'] usando el uuid del route param. */
  it('should request the 3 reports for item scope using the route uuid', async () => {
    getReportFn.mockReturnValue(of(buildReport('TotalVisits', [])));
    const { fixture } = setup('item', 'item-uuid-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const calls = getReportFn.mock.calls.map((c) => c[1]);
    expect(calls).toEqual(['TotalVisits', 'TotalDownloads', 'TotalVisitsPerMonth']);
    expect(getReportFn.mock.calls[0][0]).toBe('item-uuid-1');
  });

  /** Verifica que scope=collection dispare solo 2 reports (sin TotalDownloads), tal como DSpace 9 lo expone para community/collection. */
  it('should request the 2 reports (no Downloads) for collection scope', async () => {
    getReportFn.mockReturnValue(of(buildReport('TotalVisits', [])));
    const { fixture } = setup('collection', 'col-uuid-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const calls = getReportFn.mock.calls.map((c) => c[1]);
    expect(calls).toEqual(['TotalVisits', 'TotalVisitsPerMonth']);
  });

  /**
   * Verifica que un fallo en un report individual no rompa la página entera.
   * El catchError degrada el report afectado a null y la tarjeta correspondiente cae al empty state.
   */
  it('should keep rendering other reports when one of them fails', async () => {
    getReportFn.mockImplementation((_uuid: string, rt: UsageReportType) =>
      rt === 'TotalDownloads'
        ? throwError(() => new Error('500'))
        : of(buildReport(rt, [{ id: 'p', label: 'L', values: { views: 1 } }])),
    );
    const { fixture } = setup('item', 'item-uuid-2');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.loaded()?.length).toBe(3);
    const downloads = fixture.componentInstance
      .loaded()
      ?.find((e) => e.reportType === 'TotalDownloads');
    expect(downloads?.report).toBeNull();
  });

  /** Verifica que el título del template derive del dsoType vía la constante DSO_TYPE_TITLES. */
  it('should render the title from the dsoType', async () => {
    getReportFn.mockReturnValue(of(buildReport('TotalVisits', [])));
    const { fixture } = setup('item', 'item-uuid-3');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('[data-testid="statistics-title"]');
    expect(title.textContent).toContain('Estadísticas del recurso');
  });
});
