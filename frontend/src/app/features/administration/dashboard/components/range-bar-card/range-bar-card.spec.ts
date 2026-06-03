import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { DateRange, RangeBarCard } from './range-bar-card';
import { DiscoveryService } from '../../../../../core/api/discovery.service';
import { SearchParams, SearchResult } from '../../../../../core/api/models/discovery.model';

/**
 * Tests del widget range-bar-card del Dashboard de KPIs.
 *
 * El widget recibe N rangos como input y por cada uno hace una llamada
 * `DiscoveryService.search({ size: 0, scope, filters: [{ name: 'dateIssued',
 * value: '[from TO to]', operator: 'equals' }] })`, leyendo `totalElements`
 * de cada response. Mapea cada rango a `{ label, value }` y delega el render
 * al `<app-bar-chart>` reusado. Cuatro estados: spinner mientras alguna
 * llamada está pending, bar-chart cuando todas resuelven con al menos un
 * valor > 0, mensaje empty-state cuando todos los rangos resuelven en 0,
 * `—` cuando alguna llamada falla.
 *
 * Ciclo 11 TDD — Sprint 8.
 */
describe('RangeBarCard', () => {
  let searchFn: Mock;

  const SAMPLE_RANGES: readonly DateRange[] = [
    { label: '2008-2019', from: '2008-01-01', to: '2019-12-31' },
    { label: '2020-2023', from: '2020-01-01', to: '2023-12-31' },
    { label: '2024-2026', from: '2024-01-01', to: '2026-12-31' },
  ];

  function buildSearchResult(total: number): SearchResult {
    return {
      items: [],
      facets: [],
      totalElements: total,
      totalPages: 0,
      page: 0,
      size: 0,
    };
  }

  beforeEach(async () => {
    // Default: cada llamada devuelve un total distinto para distinguir respuestas por rango.
    let counter = 0;
    const totals = [3, 29, 20];
    searchFn = vi.fn().mockImplementation(() => of(buildSearchResult(totals[counter++] ?? 0)));

    await TestBed.configureTestingModule({
      imports: [RangeBarCard],
      providers: [
        provideNoopAnimations(),
        { provide: DiscoveryService, useValue: { search: searchFn } },
      ],
    }).compileComponents();
  });

  /** Verifica que se dispare una llamada por rango con el filtro dateIssued correcto y sin scope cuando es null. */
  it('should call DiscoveryService.search once per range with a dateIssued filter and no scope when scope input is null', () => {
    const fixture = TestBed.createComponent(RangeBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por fecha');
    fixture.componentRef.setInput('ranges', SAMPLE_RANGES);
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(3);
    const args = searchFn.mock.calls.map((c) => c[0] as SearchParams);
    expect(args[0].size).toBe(0);
    expect(args[0].scope).toBeUndefined();
    expect(args[0].filters).toEqual([
      { name: 'dateIssued', value: '[2008-01-01 TO 2019-12-31]', operator: 'equals' },
    ]);
    expect(args[1].filters?.[0]?.value).toBe('[2020-01-01 TO 2023-12-31]');
    expect(args[2].filters?.[0]?.value).toBe('[2024-01-01 TO 2026-12-31]');
  });

  /** Verifica que cada llamada propague el scope cuando viene con valor (AdminSub). */
  it('should propagate the scope UUID to every search call when scope input is a uuid', () => {
    const fixture = TestBed.createComponent(RangeBarCard);
    fixture.componentRef.setInput('scope', 'community-uuid-001');
    fixture.componentRef.setInput('label', 'Por fecha (subdirección)');
    fixture.componentRef.setInput('ranges', SAMPLE_RANGES);
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(3);
    const args = searchFn.mock.calls.map((c) => c[0] as SearchParams);
    expect(args.every((a) => a.scope === 'community-uuid-001')).toBe(true);
  });

  /** Verifica que mientras al menos una llamada está pendiente, se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while at least one call is pending', () => {
    const pending = new Subject<SearchResult>();
    searchFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(RangeBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por fecha');
    fixture.componentRef.setInput('ranges', SAMPLE_RANGES);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-bar-chart')).toBeNull();
  });

  /** Verifica que al resolver todas las llamadas con datos, se renderice <app-bar-chart> con el mapeo de cada rango. */
  it('should render <app-bar-chart> with one data point per range when all calls resolve with values', () => {
    const fixture = TestBed.createComponent(RangeBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Distribución por fecha');
    fixture.componentRef.setInput('ranges', SAMPLE_RANGES);
    fixture.detectChanges();

    const barChartEl = fixture.nativeElement.querySelector('app-bar-chart');
    expect(barChartEl).not.toBeNull();

    const component = fixture.componentInstance as unknown as {
      chartConfig: () => { type: string; title: string; data: { label: string; value: number }[] } | null;
    };
    const cfg = component.chartConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.type).toBe('bar');
    expect(cfg!.title).toBe('Distribución por fecha');
    expect(cfg!.data).toEqual([
      { label: '2008-2019', value: 3 },
      { label: '2020-2023', value: 29 },
      { label: '2024-2026', value: 20 },
    ]);
  });

  /** Verifica que cuando todos los rangos resuelven en 0 se renderice el mensaje empty-state. */
  it('should render an empty-state message when every range resolves with totalElements=0', () => {
    searchFn.mockImplementation(() => of(buildSearchResult(0)));

    const fixture = TestBed.createComponent(RangeBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por fecha');
    fixture.componentRef.setInput('ranges', SAMPLE_RANGES);
    fixture.detectChanges();

    const emptyEl = fixture.nativeElement.querySelector('[data-testid="range-bar-card-empty"]');
    expect(emptyEl).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-bar-chart')).toBeNull();
  });

  /** Verifica que ante un fallo del observable en cualquier rango, el widget renderice `—`. */
  it('should render "—" when any of the range searches errors', () => {
    let i = 0;
    searchFn.mockImplementation(() => {
      if (i++ === 1) return throwError(() => new Error('502 Bad Gateway'));
      return of(buildSearchResult(10));
    });

    const fixture = TestBed.createComponent(RangeBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por fecha');
    fixture.componentRef.setInput('ranges', SAMPLE_RANGES);
    fixture.detectChanges();

    const failedEl = fixture.nativeElement.querySelector('[data-testid="range-bar-card-failed"]');
    expect(failedEl).not.toBeNull();
    expect(failedEl.textContent.trim()).toBe('—');
  });

  /** Verifica que el label se renderice como título del card. */
  it('should render the label input as the card title', () => {
    const fixture = TestBed.createComponent(RangeBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Distribución por rangos de fecha');
    fixture.componentRef.setInput('ranges', SAMPLE_RANGES);
    fixture.detectChanges();

    const labelEl = fixture.nativeElement.querySelector('[data-testid="range-bar-card-label"]');
    expect(labelEl).not.toBeNull();
    expect(labelEl.textContent.trim()).toBe('Distribución por rangos de fecha');
  });
});
