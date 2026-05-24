import { TestBed } from '@angular/core/testing';

import { StatsFiltersComponent } from './stats-filters';
import { FilterConfig } from '../../models/stats-dashboard.model';

/**
 * Tests de `StatsFiltersComponent`.
 *
 * Renderiza los filtros declarativos que expone el renderer y mantiene los
 * valores activos en memoria local. Cada cambio emite el mapa completo al
 * container para que llame a `renderer.applyFilters` y reconstruya el
 * dashboard. Soporta single (`select`) y multi (`multi-select`).
 *
 * Ciclo 11 TDD — Sprint 7.
 */

const FILTERS: FilterConfig[] = [
  {
    key: 'departamental',
    label: 'Departamental',
    type: 'select',
    options: [
      { value: 'DIDEDUC GUATEMALA', label: 'DIDEDUC GUATEMALA' },
      { value: 'DIDEDUC ALTA VERAPAZ', label: 'DIDEDUC ALTA VERAPAZ' },
    ],
  },
  {
    key: 'rangos',
    label: 'Rangos',
    type: 'multi-select',
    options: [
      { value: '13-30', label: '13-30 años' },
      { value: '31-60', label: '31-60 años' },
    ],
  },
];

describe('StatsFiltersComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatsFiltersComponent] });
  });

  /** Iniciar con filters lista pero sin valores activos: filtersChange no se emitió aún. */
  it('should expose the input filters and start with empty active state', () => {
    const fixture = TestBed.createComponent(StatsFiltersComponent);
    fixture.componentRef.setInput('filters', FILTERS);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.filterList().length).toBe(2);
    expect(c.activeFilters()).toEqual({});
    expect(c.hasActive()).toBe(false);
  });

  /** Setear un valor activo emite el mapa completo. */
  it('should emit the full active map on setValue', () => {
    const fixture = TestBed.createComponent(StatsFiltersComponent);
    fixture.componentRef.setInput('filters', FILTERS);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    let emitted: Record<string, string | string[]> | undefined;
    c.filtersChange.subscribe((v) => (emitted = v));
    c.setValue('departamental', 'DIDEDUC GUATEMALA');

    expect(emitted).toEqual({ departamental: 'DIDEDUC GUATEMALA' });
    expect(c.hasActive()).toBe(true);
  });

  /** Setear valor empty borra la entrada del mapa. */
  it('should remove the entry when the value is empty', () => {
    const fixture = TestBed.createComponent(StatsFiltersComponent);
    fixture.componentRef.setInput('filters', FILTERS);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.setValue('departamental', 'DIDEDUC GUATEMALA');
    expect(c.hasActive()).toBe(true);

    c.setValue('departamental', '');
    expect(c.activeFilters()).toEqual({});
    expect(c.hasActive()).toBe(false);
  });

  /** clear() resetea todo y emite el mapa vacío. */
  it('should reset all active filters and emit an empty map on clear', () => {
    const fixture = TestBed.createComponent(StatsFiltersComponent);
    fixture.componentRef.setInput('filters', FILTERS);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.setValue('departamental', 'DIDEDUC GUATEMALA');
    c.setValue('rangos', ['13-30']);
    expect(c.hasActive()).toBe(true);

    let emitted: Record<string, string | string[]> | undefined;
    c.filtersChange.subscribe((v) => (emitted = v));
    c.clear();

    expect(emitted).toEqual({});
    expect(c.hasActive()).toBe(false);
  });
});
