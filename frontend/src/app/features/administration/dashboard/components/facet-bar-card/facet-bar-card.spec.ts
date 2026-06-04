import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { FacetBarCard } from './facet-bar-card';
import { DiscoveryService } from '../../../../../core/api/discovery.service';
import { Facet, SearchParams, SearchResult } from '../../../../../core/api/models/discovery.model';

/**
 * Tests del widget facet-bar-card del Dashboard de KPIs.
 *
 * El widget orquesta `DiscoveryService.search({ size: 0, scope? })`, filtra el
 * facet cuyo nombre coincide con el input `facetName` y pasa los valores al
 * `<app-bar-chart>` reusado de `features/stats/components/charts/bar-chart`.
 * Cuatro estados: spinner mientras pending, bar-chart cuando resuelve con
 * datos, empty cuando la facet no aparece, `—` cuando el observable falla.
 *
 * Ciclo 10 TDD — Sprint 8. Ajustado en Ciclo 14 (Sprint 8).
 */
describe('FacetBarCard', () => {
  let searchFn: Mock;

  function buildFacet(name: string, values: { label: string; count: number }[]): Facet {
    return { name, values };
  }

  function buildSearchResult(facets: Facet[]): SearchResult {
    return {
      items: [],
      facets,
      totalElements: 0,
      totalPages: 0,
      page: 0,
      size: 0,
    };
  }

  beforeEach(async () => {
    searchFn = vi.fn().mockReturnValue(
      of(
        buildSearchResult([
          buildFacet('entityType', [
            { label: 'Documento', count: 53 },
            { label: 'Galeria', count: 12 },
            { label: 'Estadistica', count: 8 },
          ]),
        ]),
      ),
    );
    await TestBed.configureTestingModule({
      imports: [FacetBarCard],
      providers: [
        provideNoopAnimations(),
        { provide: DiscoveryService, useValue: { search: searchFn } },
      ],
    }).compileComponents();
  });

  /** Verifica que con scope null (SuperAdmin) la llamada a search omita el scope y use size=0. */
  it('should call DiscoveryService.search with size=0 and no scope when scope input is null', () => {
    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por tipo');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.size).toBe(0);
    expect(args.scope).toBeUndefined();
  });

  /** Verifica que con scope concreto (AdminSub) la llamada propague el scope al search. */
  it('should call DiscoveryService.search with size=0 and propagate scope when scope input is a uuid', () => {
    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', 'community-uuid-001');
    fixture.componentRef.setInput('label', 'Por tipo (subdirección)');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.size).toBe(0);
    expect(args.scope).toBe('community-uuid-001');
  });

  /** Verifica que la llamada incluya `dsoType: 'item'` para que la facet agrupe solo sobre items archivados. */
  it('should call DiscoveryService.search with dsoType: "item"', () => {
    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por tipo');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.dsoType).toBe('item');
  });

  /** Verifica que mientras el observable está pendiente se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while the search observable is pending', () => {
    const pending = new Subject<SearchResult>();
    searchFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por tipo');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-bar-chart')).toBeNull();
  });

  /** Verifica que al resolver con datos del facet, se renderice <app-bar-chart> con la conversión correcta. */
  it('should render <app-bar-chart> with the requested facet values mapped to ChartConfig when search resolves', () => {
    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Distribución por tipo');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    const barChartEl = fixture.nativeElement.querySelector('app-bar-chart');
    expect(barChartEl).not.toBeNull();
    // Verificación profunda: el componente debe haber construido un ChartConfig con
    // tres data points (Documento, Galeria, Estadistica) extraídos del facet entityType.
    const component = fixture.componentInstance as unknown as {
      chartConfig: () => { type: string; title: string; data: { label: string; value: number }[] } | null;
    };
    const cfg = component.chartConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.type).toBe('bar');
    expect(cfg!.title).toBe('Distribución por tipo');
    expect(cfg!.data).toEqual([
      { label: 'Documento', value: 53 },
      { label: 'Galeria', value: 12 },
      { label: 'Estadistica', value: 8 },
    ]);
  });

  /** Verifica que cuando la facet solicitada no aparece en el response, se renderice mensaje empty-state. */
  it('should render an empty-state message when the resolved search does not contain the requested facet', () => {
    searchFn.mockReturnValue(
      of(buildSearchResult([buildFacet('language', [{ label: 'es', count: 10 }])])),
    );

    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por tipo');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    const emptyEl = fixture.nativeElement.querySelector('[data-testid="facet-bar-card-empty"]');
    expect(emptyEl).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-bar-chart')).toBeNull();
  });

  /** Verifica que ante un fallo del observable se renderice `—` como fallback silencioso. */
  it('should render "—" when the search observable errors', () => {
    searchFn.mockReturnValue(throwError(() => new Error('502 Bad Gateway')));

    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Por tipo');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    const failedEl = fixture.nativeElement.querySelector('[data-testid="facet-bar-card-failed"]');
    expect(failedEl).not.toBeNull();
    expect(failedEl.textContent.trim()).toBe('—');
  });

  /** Verifica que el label se renderice como título del card. */
  it('should render the label input as the card title', () => {
    const fixture = TestBed.createComponent(FacetBarCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Distribución por tipo de documento');
    fixture.componentRef.setInput('facetName', 'entityType');
    fixture.detectChanges();

    const labelEl = fixture.nativeElement.querySelector('[data-testid="facet-bar-card-label"]');
    expect(labelEl).not.toBeNull();
    expect(labelEl.textContent.trim()).toBe('Distribución por tipo de documento');
  });
});
