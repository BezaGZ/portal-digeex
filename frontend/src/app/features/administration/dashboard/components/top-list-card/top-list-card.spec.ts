import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { TopListCard } from './top-list-card';
import { DiscoveryService } from '../../../../../core/api/discovery.service';
import { Facet, SearchParams, SearchResult } from '../../../../../core/api/models/discovery.model';

/**
 * Tests del widget top-list-card del Dashboard de KPIs.
 *
 * El widget consume `DiscoveryService.search({ size: 0, scope? })`, busca el
 * facet cuyo nombre coincide con `facetName` (default `'collection'`), ordena
 * sus values por count desc, toma los primeros `limit` (default 10) y los
 * renderiza como lista clickeable. Cada entrada incluye el `authorityKey`
 * preservado por el wrapper (UUID de la colección). El click emite la entrada
 * completa; la navegación la decide el padre (DIP del widget vs Router).
 *
 * Ciclo 11 TDD — Sprint 8.
 */
describe('TopListCard', () => {
  let searchFn: Mock;

  function buildFacet(name: string, values: { label: string; count: number; authorityKey?: string }[]): Facet {
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
          buildFacet('collection', [
            { label: 'PEAC', count: 45, authorityKey: 'coll-peac' },
            { label: 'PRONEA', count: 12, authorityKey: 'coll-pronea' },
            { label: 'Modalidades Flexibles', count: 8, authorityKey: 'coll-modf' },
          ]),
        ]),
      ),
    );
    await TestBed.configureTestingModule({
      imports: [TopListCard],
      providers: [
        provideNoopAnimations(),
        { provide: DiscoveryService, useValue: { search: searchFn } },
      ],
    }).compileComponents();
  });

  /** Verifica que con scope null (SuperAdmin) la llamada a search omita el scope. */
  it('should call DiscoveryService.search with size=0 and no scope when scope input is null', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.size).toBe(0);
    expect(args.scope).toBeUndefined();
  });

  /** Verifica que con scope concreto (AdminSub) la llamada propague el scope. */
  it('should call DiscoveryService.search with size=0 and propagate scope when scope input is a uuid', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', 'community-uuid-001');
    fixture.componentRef.setInput('label', 'Top colecciones de la subdirección');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.scope).toBe('community-uuid-001');
  });

  /** Verifica que mientras el observable está pendiente se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while the search observable is pending', () => {
    const pending = new Subject<SearchResult>();
    searchFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="top-list-card-row"]')).toBeNull();
  });

  /** Verifica que al resolver con datos del facet, se rendericen los N items ordenados por count desc. */
  it('should render the top entries ordered by count desc when the search resolves with the requested facet', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="top-list-card-row"]');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('PEAC');
    expect(rows[0].textContent).toContain('45');
    expect(rows[1].textContent).toContain('PRONEA');
    expect(rows[2].textContent).toContain('Modalidades Flexibles');
  });

  /** Verifica que el input limit acote el render a los primeros N items. */
  it('should truncate the rendered list to `limit` entries when the facet contains more values', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top 2');
    fixture.componentRef.setInput('limit', 2);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="top-list-card-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('PEAC');
    expect(rows[1].textContent).toContain('PRONEA');
  });

  /** Verifica que al hacer click en una fila se emita el output entryClicked con uuid+label+count. */
  it('should emit entryClicked with the selected entry when a row is clicked', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    let emitted: { uuid: string; label: string; count: number } | null = null;
    fixture.componentInstance.entryClicked.subscribe((e) => (emitted = e));

    const firstRowBtn = fixture.nativeElement.querySelector('[data-testid="top-list-card-row"]') as HTMLButtonElement;
    firstRowBtn.click();
    fixture.detectChanges();

    expect(emitted).toEqual({ uuid: 'coll-peac', label: 'PEAC', count: 45 });
  });

  /** Verifica que cuando el facet pedido no aparece en el response se renderice empty-state. */
  it('should render an empty-state message when the resolved search does not contain the requested facet', () => {
    searchFn.mockReturnValue(
      of(buildSearchResult([buildFacet('language', [{ label: 'es', count: 10 }])])),
    );

    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    const emptyEl = fixture.nativeElement.querySelector('[data-testid="top-list-card-empty"]');
    expect(emptyEl).not.toBeNull();
  });

  /** Verifica que ante un fallo del observable se renderice `—` como fallback silencioso. */
  it('should render "—" when the search observable errors', () => {
    searchFn.mockReturnValue(throwError(() => new Error('502 Bad Gateway')));

    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    const failedEl = fixture.nativeElement.querySelector('[data-testid="top-list-card-failed"]');
    expect(failedEl).not.toBeNull();
    expect(failedEl.textContent.trim()).toBe('—');
  });
});
