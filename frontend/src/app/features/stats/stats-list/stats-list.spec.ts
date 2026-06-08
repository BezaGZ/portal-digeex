import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { StatsList } from './stats-list';
import { StatsListService } from '../services/stats-list.service';
import { StatisticsTrackingService } from '../../../core/api/statistics-tracking.service';
import { StatsItem, StatsItemPage } from '../models/stats-item.model';

/**
 * Tests del `StatsList`.
 *
 * Container del listado público en `/estadistica`. Pide la primera página al
 * service en `ngOnInit`, mantiene el estado en signals (items, total, page,
 * loading), filtra client-side por dataset y navega al detalle por uuid en
 * el click de la card.
 *
 * Ciclo 10 TDD — Sprint 7. Ajustado en Ciclo 26 (Sprint 8).
 */

const SAMPLE_ITEMS: StatsItem[] = [
  { uuid: 'a', title: 'Docentes 2026', abstract: '', dataset: 'docentes', issued: '2026-05-21' },
  { uuid: 'b', title: 'Estudiantes 2026', abstract: '', dataset: 'estudiantes', issued: '2026-05-21' },
  { uuid: 'c', title: 'Docentes 2025', abstract: '', dataset: 'docentes', issued: '2025-12-31' },
];

function buildPage(items: StatsItem[], total = items.length, page = 0): StatsItemPage {
  return { items, totalElements: total, totalPages: 1, page, size: 12 };
}

describe('StatsList', () => {
  let searchFn: ReturnType<typeof vi.fn>;
  let getStatsCollectionUuidFn: ReturnType<typeof vi.fn>;
  let trackFn: ReturnType<typeof vi.fn>;
  let navigateFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    searchFn = vi.fn();
    getStatsCollectionUuidFn = vi.fn().mockReturnValue(of('col-estadistica'));
    trackFn = vi.fn().mockReturnValue(of(undefined));
    navigateFn = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: StatsListService,
          useValue: {
            searchStats: searchFn,
            getStatsCollectionUuid$: getStatsCollectionUuidFn,
          },
        },
        { provide: StatisticsTrackingService, useValue: { trackView$: trackFn } },
        { provide: Router, useValue: { navigate: navigateFn } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
      ],
    });
  });

  /** Pide la primera página al montar y llena los signals con los items recibidos. */
  it('should request the first page on init and populate items', () => {
    searchFn.mockReturnValue(of(buildPage(SAMPLE_ITEMS)));

    const fixture = TestBed.createComponent(StatsList);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(searchFn).toHaveBeenCalledWith(0, 12, 'col-estadistica');
    expect(c.items().length).toBe(3);
    expect(c.totalRecords()).toBe(3);
    expect(c.isLoading()).toBe(false);
  });

  /** isLoading inicia en true y baja a false cuando el service responde. */
  it('should toggle isLoading around the fetch', () => {
    searchFn.mockReturnValue(of(buildPage(SAMPLE_ITEMS)));

    const fixture = TestBed.createComponent(StatsList);
    const c = fixture.componentInstance;
    expect(c.isLoading()).toBe(true);

    fixture.detectChanges();
    expect(c.isLoading()).toBe(false);
  });

  /** Si el service falla, deja items vacíos y baja loading sin lanzar. */
  it('should degrade to empty items when the service errors out', () => {
    searchFn.mockReturnValue(throwError(() => new Error('network')));

    const fixture = TestBed.createComponent(StatsList);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.items().length).toBe(0);
    expect(c.totalRecords()).toBe(0);
    expect(c.isLoading()).toBe(false);
  });

  /** Cambio de página dispara un nuevo fetch con el número de página correcto. */
  it('should fetch the requested page on paginator change', () => {
    searchFn.mockReturnValue(of(buildPage(SAMPLE_ITEMS)));

    const fixture = TestBed.createComponent(StatsList);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.onPageChange({ page: 2 });

    expect(searchFn).toHaveBeenLastCalledWith(2, 12, 'col-estadistica');
  });

  /** Verifica que registre una visita a la colección Estadistica una sola vez al montar. */
  it('should register one view to the Estadistica collection on init', () => {
    searchFn.mockReturnValue(of(buildPage(SAMPLE_ITEMS)));

    const fixture = TestBed.createComponent(StatsList);
    fixture.detectChanges();

    expect(getStatsCollectionUuidFn).toHaveBeenCalledTimes(1);
    expect(trackFn).toHaveBeenCalledWith('col-estadistica', 'collection');
    expect(trackFn).toHaveBeenCalledTimes(1);
  });

  /** Verifica que cambiar de página no dispare un tracking adicional. */
  it('should not track an extra view on page change', () => {
    searchFn.mockReturnValue(of(buildPage(SAMPLE_ITEMS)));

    const fixture = TestBed.createComponent(StatsList);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.onPageChange({ page: 1 });
    c.onPageChange({ page: 2 });

    expect(trackFn).toHaveBeenCalledTimes(1);
  });

  /** Click en card navega a /estadistica/:uuid con el uuid emitido. */
  it('should navigate to the detail route with the item uuid on card open', () => {
    searchFn.mockReturnValue(of(buildPage(SAMPLE_ITEMS)));

    const fixture = TestBed.createComponent(StatsList);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openItem('a');

    expect(navigateFn).toHaveBeenCalledWith(['/estadistica', 'col-estadistica', 'item', 'a']);
  });
});
