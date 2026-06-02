import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { of, throwError } from 'rxjs';

import { StatsDetail } from './stats-detail';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { BundleApiService } from '../../../core/api/bundle-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { ExcelReaderService } from '../services/excel-reader.service';
import {
  registerStatsRenderer,
  clearStatsRendererRegistry,
} from '../stats-dataset-registry';
import { StatsRenderer } from '../renderers/stats-renderer.interface';
import { StatsDashboard, FilterConfig } from '../models/stats-dashboard.model';
import { ParsedExcel } from '../models/parsed-excel.model';
import { Item } from '../../../core/api/models/item.model';

/**
 * Tests del `StatsDetail`.
 *
 * Container del detalle público en `/estadistica/:uuid`. Orquesta la
 * resolución del item, el renderer del registry, la descarga del Excel y la
 * construcción del dashboard. Cubre los cuatro modos de error (`not-found`,
 * `unsupported`, `pii`, `network`) y el flujo feliz con filtros.
 *
 * Ciclo 11 TDD — Sprint 7. Ajustado en Ciclo 16.
 */

const DASHBOARD: StatsDashboard = {
  sections: [
    {
      title: 'Indicadores',
      charts: [{ type: 'kpi', title: 'Total', data: [{ label: 'Total', value: 42 }] }],
    },
  ],
};

const FILTERS_CONFIG: FilterConfig[] = [
  {
    key: 'departamental',
    label: 'Departamental',
    type: 'select',
    options: [{ value: 'X', label: 'X' }],
  },
];

@Injectable({ providedIn: 'root' })
class FakeRenderer implements StatsRenderer {
  parseSpy = vi.fn(() => DASHBOARD);
  applySpy = vi.fn((d: StatsDashboard) => d);
  filtersSpy = vi.fn(() => FILTERS_CONFIG as readonly FilterConfig[]);

  parse(_workbook: unknown): StatsDashboard {
    return this.parseSpy();
  }
  getFilters(): readonly FilterConfig[] {
    return this.filtersSpy();
  }
  applyFilters(d: StatsDashboard): StatsDashboard {
    return this.applySpy(d);
  }
}

@Injectable({ providedIn: 'root' })
class FakeRendererEmpty implements StatsRenderer {
  parse(): StatsDashboard {
    return { sections: [] };
  }
  getFilters(): readonly FilterConfig[] {
    return [];
  }
  applyFilters(d: StatsDashboard): StatsDashboard {
    return d;
  }
}

function buildItem(uuid: string, datasetKey: string | undefined, title?: string): Item {
  const metadata: Record<string, Array<{ value: string; language: null; authority: null; confidence: number; place: number }>> = {};
  if (datasetKey) {
    metadata['digeex.statsDataset'] = [
      { value: datasetKey, language: null, authority: null, confidence: -1, place: 0 },
    ];
  }
  if (title) {
    metadata['dc.title'] = [
      { value: title, language: null, authority: null, confidence: -1, place: 0 },
    ];
  }
  return {
    uuid,
    name: 'Item',
    handle: null,
    metadata,
    inArchive: true,
    discoverable: true,
    withdrawn: false,
    lastModified: '2026-05-22T00:00:00Z',
    type: 'item',
  } as unknown as Item;
}

const PARSED_EXCEL: ParsedExcel = {
  sheetNames: ['Hoja1'],
  sheets: { Hoja1: { headers: ['Col'], rows: [{ Col: 'A' }] } },
};

describe('StatsDetail', () => {
  let getItemFn: ReturnType<typeof vi.fn>;
  let listForItemFn: ReturnType<typeof vi.fn>;
  let listBitstreamsFn: ReturnType<typeof vi.fn>;
  let getParsedExcelFn: ReturnType<typeof vi.fn>;
  let navigateFn: ReturnType<typeof vi.fn>;
  let setTrailFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearStatsRendererRegistry();
    registerStatsRenderer('docentes', FakeRenderer);
    registerStatsRenderer('empty-dataset', FakeRendererEmpty);

    getItemFn = vi.fn();
    listForItemFn = vi.fn();
    listBitstreamsFn = vi.fn();
    getParsedExcelFn = vi.fn();
    navigateFn = vi.fn();
    setTrailFn = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { params: { uuid: 'item-1' } } } },
        { provide: Router, useValue: { navigate: navigateFn } },
        { provide: DSpaceApiService, useValue: { getItem: getItemFn } },
        {
          provide: BundleApiService,
          useValue: {
            listForItem: listForItemFn,
            listBitstreams: listBitstreamsFn,
          },
        },
        { provide: ExcelReaderService, useValue: { getParsedExcel$: getParsedExcelFn } },
        { provide: BreadcrumbService, useValue: { setTrail: setTrailFn } },
      ],
    });
  });

  function mockHappyPath(): void {
    getItemFn.mockReturnValue(of(buildItem('item-1', 'docentes')));
    listForItemFn.mockReturnValue(
      of({ _embedded: { bundles: [{ uuid: 'bundle-1', name: 'ORIGINAL' }] } }),
    );
    listBitstreamsFn.mockReturnValue(
      of({ items: [{ uuid: 'bs-1', name: 'datos.xlsx' }], totalElements: 1, totalPages: 1, page: 0, size: 1 }),
    );
    getParsedExcelFn.mockReturnValue(of(PARSED_EXCEL));
  }

  /** Flujo feliz: carga item, resuelve bundle ORIGINAL, descarga Excel y publica dashboard + filtros. */
  it('should orchestrate the happy path: item → bundle → bitstream → parse → dashboard + filters', () => {
    mockHappyPath();
    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(getItemFn).toHaveBeenCalledWith('item-1');
    expect(listForItemFn).toHaveBeenCalledWith('item-1');
    expect(listBitstreamsFn).toHaveBeenCalledWith('bundle-1', 0, 1);
    expect(getParsedExcelFn).toHaveBeenCalledWith('item-1', 'bs-1');
    expect(c.dashboard()).toBe(DASHBOARD);
    expect(c.filters().length).toBe(1);
    expect(c.isLoading()).toBe(false);
    expect(c.errorState()).toBeNull();
  });

  /** Item 404 → errorState `not-found`. */
  it('should set errorState to not-found when the item does not exist', () => {
    getItemFn.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();

    expect(fixture.componentInstance.errorState()).toBe('not-found');
    expect(fixture.componentInstance.isLoading()).toBe(false);
  });

  /** Dataset no registrado → errorState `unsupported`. */
  it('should set errorState to unsupported when the dataset key has no registered renderer', () => {
    getItemFn.mockReturnValue(of(buildItem('item-1', 'dataset-fantasma')));

    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();

    expect(fixture.componentInstance.errorState()).toBe('unsupported');
  });

  /**
   * Si el renderer concreto devuelve un dashboard sin secciones (parse es
   * resiliente y nunca lanza), el componente lo publica sin errorState; la
   * vista suprime el panel y el visitante solo ve el header del item.
   */
  it('should publish an empty dashboard without errorState when parse returns no sections', () => {
    getItemFn.mockReturnValue(of(buildItem('item-1', 'empty-dataset')));
    listForItemFn.mockReturnValue(
      of({ _embedded: { bundles: [{ uuid: 'bundle-1', name: 'ORIGINAL' }] } }),
    );
    listBitstreamsFn.mockReturnValue(
      of({ items: [{ uuid: 'bs-1' }], totalElements: 1, totalPages: 1, page: 0, size: 1 }),
    );
    getParsedExcelFn.mockReturnValue(of(PARSED_EXCEL));

    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.errorState()).toBeNull();
    expect(c.dashboard()?.sections.length ?? -1).toBe(0);
  });

  /** Fallo de red en cualquier paso de la cadena → errorState `network`. */
  it('should set errorState to network on any HTTP failure other than 404', () => {
    getItemFn.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();

    expect(fixture.componentInstance.errorState()).toBe('network');
  });

  /** onFiltersChange llama applyFilters y publica el dashboard reconstruido. */
  it('should reapply filters via renderer.applyFilters on filtersChange', () => {
    mockHappyPath();
    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const filteredDashboard: StatsDashboard = { sections: [] };
    const renderer = TestBed.inject(FakeRenderer);
    renderer.applySpy.mockReturnValue(filteredDashboard);

    c.onFiltersChange({ departamental: 'X' });

    expect(renderer.applySpy).toHaveBeenCalled();
    expect(c.dashboard()).toBe(filteredDashboard);
  });

  /** goBack navega al listado. */
  it('should navigate back to the listing on goBack', () => {
    mockHappyPath();
    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();

    fixture.componentInstance.goBack();

    expect(navigateFn).toHaveBeenCalledWith(['/estadistica']);
  });

  /** Verifica que setTrail publique [{label:'Estadística', routerLink}, {label: dc.title}] tras resolver getItem. */
  it('should publish the breadcrumb trail with the item dc.title after getItem resolves', () => {
    getItemFn.mockReturnValue(of(buildItem('item-1', 'docentes', 'Estudiantes 2024')));
    listForItemFn.mockReturnValue(
      of({ _embedded: { bundles: [{ uuid: 'bundle-1', name: 'ORIGINAL' }] } }),
    );
    listBitstreamsFn.mockReturnValue(
      of({ items: [{ uuid: 'bs-1' }], totalElements: 1, totalPages: 1, page: 0, size: 1 }),
    );
    getParsedExcelFn.mockReturnValue(of(PARSED_EXCEL));

    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();

    expect(setTrailFn).toHaveBeenCalledWith([
      { label: 'Estadística', routerLink: '/estadistica' },
      { label: 'Estudiantes 2024' },
    ]);
  });

  /** Verifica que el trail caiga al fallback 'Detalle' cuando el item no expone dc.title. */
  it('should fall back to "Detalle" in the trail when the item has no dc.title', () => {
    getItemFn.mockReturnValue(of(buildItem('item-1', 'docentes')));
    listForItemFn.mockReturnValue(
      of({ _embedded: { bundles: [{ uuid: 'bundle-1', name: 'ORIGINAL' }] } }),
    );
    listBitstreamsFn.mockReturnValue(
      of({ items: [{ uuid: 'bs-1' }], totalElements: 1, totalPages: 1, page: 0, size: 1 }),
    );
    getParsedExcelFn.mockReturnValue(of(PARSED_EXCEL));

    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();

    expect(setTrailFn).toHaveBeenCalledWith([
      { label: 'Estadística', routerLink: '/estadistica' },
      { label: 'Detalle' },
    ]);
  });

  /** retry limpia errorState y vuelve a cargar; permite recuperarse de network error. */
  it('should clear errorState and retry on retry()', () => {
    getItemFn.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = TestBed.createComponent(StatsDetail);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.errorState()).toBe('network');

    getItemFn.mockReturnValue(of(buildItem('item-1', 'docentes')));
    listForItemFn.mockReturnValue(
      of({ _embedded: { bundles: [{ uuid: 'bundle-1', name: 'ORIGINAL' }] } }),
    );
    listBitstreamsFn.mockReturnValue(
      of({ items: [{ uuid: 'bs-1' }], totalElements: 1, totalPages: 1, page: 0, size: 1 }),
    );
    getParsedExcelFn.mockReturnValue(of(PARSED_EXCEL));

    c.retry();

    expect(c.errorState()).toBeNull();
    expect(c.dashboard()).toBe(DASHBOARD);
  });
});
