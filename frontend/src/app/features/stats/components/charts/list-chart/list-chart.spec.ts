import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ListChartComponent } from './list-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `ListChartComponent`.
 *
 * Lista pura de labels sin valores: replica las tablas/listados del
 * dashboard de PowerBI donde la columna sirve para enumerar categorías sin
 * mostrar conteo. Recibe un `ChartConfig` y renderiza un `<ul>` con un
 * `<li>` por entrada del data array, preservando el orden.
 *
 * Ciclo 11 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'list',
  title: 'Tipos de discapacidad',
  data: [
    { label: 'DISCAPACIDAD AUDITIVA', value: 8 },
    { label: 'DISCAPACIDAD INTELECTUAL', value: 46 },
    { label: 'DISCAPACIDAD VISUAL', value: 28 },
  ],
};

describe('ListChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ListChartComponent] });
  });

  /** Renderiza un li por cada label del data, preservando el orden. */
  it('should render one <li> per data label preserving order', () => {
    const fixture = TestBed.createComponent(ListChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('li'));
    expect(items.length).toBe(3);
    expect(items[0].nativeElement.textContent.trim()).toBe('DISCAPACIDAD AUDITIVA');
    expect(items[1].nativeElement.textContent.trim()).toBe('DISCAPACIDAD INTELECTUAL');
    expect(items[2].nativeElement.textContent.trim()).toBe('DISCAPACIDAD VISUAL');
  });

  /** No muestra valores numéricos en ninguna parte del DOM. */
  it('should not render any value or count next to the labels', () => {
    const fixture = TestBed.createComponent(ListChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('46');
    expect(text).not.toContain('28');
    expect(text).not.toContain('8');
  });

  /** Cuando data está vacío muestra un mensaje "Sin registros para mostrar". */
  it('should show an empty placeholder when data is empty', () => {
    const fixture = TestBed.createComponent(ListChartComponent);
    fixture.componentRef.setInput('config', { ...SAMPLE_CONFIG, data: [] });
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('li')).length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Sin registros');
  });
});
