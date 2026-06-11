import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { StatisticsPage } from './statistics-page';
import { StatisticsApiService } from '../../../core/api/statistics-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { UsageReport, UsageReportType } from '../../../core/api/models/usage-report.model';

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
 * Ciclo 23 TDD — Sprint 8. Ajustado en Ciclos 28, 29 y 34 (Sprint 8).
 */
describe('StatisticsPage', () => {
  let getReportFn: ReturnType<typeof vi.fn>;
  let getReportsForSiteFn: ReturnType<typeof vi.fn>;
  let setTrailFn: ReturnType<typeof vi.fn>;
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
          provide: BreadcrumbService,
          useValue: { setTrail: setTrailFn, clear: vi.fn() },
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
    setTrailFn = vi.fn();
  });

  /**
   * Drena la consulta del nombre del DSO que la página dispara para el PDF
   * de exportación, en los tests que no la asertan.
   */
  function flushDsoNameRequest(): void {
    httpMock
      .match((req) => /\/core\/(items|collections)\//.test(req.url))
      .forEach((req) => req.flush({ name: 'DSO de prueba', handle: '123456789/1' }));
  }

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
    flushDsoNameRequest();
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
    flushDsoNameRequest();
    await fixture.whenStable();
    fixture.detectChanges();

    const calls = getReportFn.mock.calls.map((c) => c[1]);
    expect(calls).toEqual(['TotalVisits', 'TotalVisitsPerMonth']);
  });

  /** Verifica que publique el trail [Estadísticas de uso, <nombre real>] al resolver el DSO. */
  it('should publish the breadcrumb trail with the resolved dso name for collection scope', async () => {
    getReportFn.mockReturnValue(of(buildReport('TotalVisits', [])));
    const { fixture } = setup('collection', 'col-uuid-9');
    fixture.detectChanges();
    httpMock
      .match((req) => /\/core\/collections\//.test(req.url))
      .forEach((req) => req.flush({ name: 'Alfabetización Bilingüe', handle: '123456789/9' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setTrailFn).toHaveBeenLastCalledWith([
      { label: 'Estadísticas de uso', routerLink: '/administrador/uso' },
      { label: 'Alfabetización Bilingüe' },
    ]);
  });

  /**
   * Verifica que scope=site no publique trail.
   * Su ruta ya declara data.breadcrumb y el trail derivado de rutas la cubre.
   */
  it('should not publish a breadcrumb trail for site scope', async () => {
    getReportsForSiteFn.mockReturnValue(of([buildReport('TotalVisits', [])]));
    const { fixture } = setup('site', null);
    fixture.detectChanges();
    httpMock.expectOne('/server/api/core/sites').flush({ _embedded: { sites: [] } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setTrailFn).not.toHaveBeenCalled();
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
    flushDsoNameRequest();
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
    flushDsoNameRequest();
    await fixture.whenStable();
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('[data-testid="statistics-title"]');
    expect(title.textContent).toContain('Estadísticas del recurso');
  });

  /** Verifica que el signal `monthsBack` arranque en 12 (default del filtro temporal). */
  it('should default monthsBack to 12 months', () => {
    getReportFn.mockReturnValue(of(buildReport('TotalVisits', [])));
    const { fixture } = setup('item', 'item-uuid-x');
    fixture.detectChanges();
    flushDsoNameRequest();

    expect(fixture.componentInstance.monthsBack()).toBe(12);
  });

  /** Verifica que el dropdown del filtro temporal exista en el HTML con su data-testid. */
  it('should render the months-back dropdown with the expected data-testid', async () => {
    getReportFn.mockReturnValue(of(buildReport('TotalVisits', [])));
    const { fixture } = setup('item', 'item-uuid-y');
    fixture.detectChanges();
    flushDsoNameRequest();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="stats-page-months-back-select"]'),
    ).not.toBeNull();
  });

  /**
   * Verifica que el dropdown se esconda cuando dsoType=site porque ese scope
   * solo devuelve TotalVisits (ranking de items) sin TotalVisitsPerMonth.
   */
  it('should hide the months-back dropdown when dsoType is site', async () => {
    getReportsForSiteFn.mockReturnValue(of([buildReport('TotalVisits', [])]));
    const { fixture } = setup('site', null);
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url.endsWith('/core/sites')).flush({
      _embedded: {
        sites: [
          { uuid: 'site-z', _links: { self: { href: 'http://localhost:8080/server/api/core/sites/site-z' } } },
        ],
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="stats-page-months-back-select"]'),
    ).toBeNull();
  });

  /**
   * Verifica que scope=item consulte el nombre y handle reales del DSO para
   * que el PDF de exportación identifique el recurso: sin nombre real el
   * reporte no sirve como evidencia institucional.
   */
  it('should fetch the item name and handle to expose dsoTitle for the export', async () => {
    getReportFn.mockReturnValue(of(buildReport('TotalVisits', [])));
    const { fixture } = setup('item', 'item-uuid-9');
    fixture.detectChanges();

    const req = httpMock.expectOne('/server/api/core/items/item-uuid-9');
    req.flush({ name: 'Guía PEAC', handle: '123456789/77' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.dsoTitle()).toBe('Guía PEAC');
    expect(fixture.componentInstance.dsoHandle()).toBe('123456789/77');
  });

  /** Verifica que el botón de exportar PDF aparezca cuando hay al menos un report cargado. */
  it('should render the export statistics button when reports are loaded', async () => {
    getReportFn.mockReturnValue(
      of(buildReport('TotalVisits', [{ id: 'p', label: 'L', values: { views: 1 } }])),
    );
    const { fixture } = setup('item', 'item-uuid-z');
    fixture.detectChanges();
    flushDsoNameRequest();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="export-statistics-pdf"]'),
    ).not.toBeNull();
  });
});
