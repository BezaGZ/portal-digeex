import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { TotalCard } from './total-card';
import { DiscoveryService } from '../../../../../core/api/discovery.service';
import { SearchParams, SearchResult } from '../../../../../core/api/models/discovery.model';

/**
 * Tests del widget total-card del Dashboard de KPIs.
 *
 * El widget consume `DiscoveryService.search({ size: 0, scope? })` y renderiza
 * el `totalElements` del response como número grande. Mantiene la convención
 * del proyecto de delegar HTTP al wrapper existente en lugar de duplicar la
 * llamada. El render tiene tres estados: spinner mientras pending, número
 * cuando resuelve, `—` cuando el observable falla.
 *
 * Ciclo 9 TDD — Sprint 8. Ajustado en Ciclo 14 (Sprint 8).
 */
describe('TotalCard', () => {
  let searchFn: Mock;

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
    searchFn = vi.fn().mockReturnValue(of(buildSearchResult(2847)));
    await TestBed.configureTestingModule({
      imports: [TotalCard],
      providers: [
        provideNoopAnimations(),
        { provide: DiscoveryService, useValue: { search: searchFn } },
      ],
    }).compileComponents();
  });

  /** Verifica que con scope null (SuperAdmin) la llamada a search omita el scope. */
  it('should call DiscoveryService.search with size=0 and no scope when scope input is null', () => {
    const fixture = TestBed.createComponent(TotalCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Total de items');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.size).toBe(0);
    expect(args.scope).toBeUndefined();
  });

  /** Verifica que con scope concreto (AdminSub) la llamada lo propague al search. */
  it('should call DiscoveryService.search with the provided scope when scope input is a uuid', () => {
    const fixture = TestBed.createComponent(TotalCard);
    fixture.componentRef.setInput('scope', 'community-uuid-001');
    fixture.componentRef.setInput('label', 'Items de la subdirección');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.size).toBe(0);
    expect(args.scope).toBe('community-uuid-001');
  });

  /** Verifica que la llamada incluya `dsoType: 'item'` para que Discovery cuente solo items archivados. */
  it('should call DiscoveryService.search with dsoType: "item"', () => {
    const fixture = TestBed.createComponent(TotalCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Total');
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledTimes(1);
    const args = searchFn.mock.calls[0]?.[0] as SearchParams;
    expect(args.dsoType).toBe('item');
  });

  /** Verifica que mientras el observable está pendiente se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while the search observable is pending', () => {
    const pending = new Subject<SearchResult>();
    searchFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(TotalCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Total');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="total-card-value"]')).toBeNull();
  });

  /** Verifica que cuando el observable resuelve, se renderice el totalElements formateado con separador de miles. */
  it('should render the totalElements value formatted with thousand separators when the search resolves', () => {
    const fixture = TestBed.createComponent(TotalCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Total');
    fixture.detectChanges();

    const valueEl = fixture.nativeElement.querySelector('[data-testid="total-card-value"]');
    expect(valueEl).not.toBeNull();
    // El pipe `number` formatea con separador de miles según el locale (ej. "2,847").
    // Se valida la presencia del valor numérico sin asumir el separador exacto.
    expect(valueEl.textContent.replace(/[^0-9]/g, '')).toBe('2847');
  });

  /** Verifica que el label recibido como input se renderice en el card. */
  it('should render the label input as the card title', () => {
    const fixture = TestBed.createComponent(TotalCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Total de items archivados');
    fixture.detectChanges();

    const labelEl = fixture.nativeElement.querySelector('[data-testid="total-card-label"]');
    expect(labelEl).not.toBeNull();
    expect(labelEl.textContent.trim()).toBe('Total de items archivados');
  });

  /** Verifica que ante un fallo del observable se renderice `—` como fallback silencioso. */
  it('should render "—" when the search observable errors', () => {
    searchFn.mockReturnValue(throwError(() => new Error('502 Bad Gateway')));

    const fixture = TestBed.createComponent(TotalCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Total');
    fixture.detectChanges();

    const valueEl = fixture.nativeElement.querySelector('[data-testid="total-card-value"]');
    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent.trim()).toBe('—');
  });
});
