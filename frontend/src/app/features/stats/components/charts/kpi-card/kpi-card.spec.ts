import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { KpiCardComponent } from './kpi-card';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `KpiCardComponent`.
 *
 * Card de KPI puro: número grande + etiqueta. Consume el primer
 * `ChartDataPoint` del `ChartConfig` que recibe; ignora el resto. Pensado
 * para la sección Indicadores del dashboard donde cada KPI viaja como un
 * `ChartConfig` independiente con un solo dato.
 *
 * Ciclo 11 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'kpi',
  title: 'Técnicas Docentes',
  data: [{ label: 'Técnicas Docentes', value: 548 }],
};

describe('KpiCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [KpiCardComponent] });
  });

  /** Renderiza el primer valor del data array como número y el title como etiqueta. */
  it('should render the first data point value and the chart title', () => {
    const fixture = TestBed.createComponent(KpiCardComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('548');
    expect(text).toContain('Técnicas Docentes');
  });

  /** Si el data array está vacío, muestra 0 sin fallar. */
  it('should fall back to zero when the data array is empty', () => {
    const fixture = TestBed.createComponent(KpiCardComponent);
    fixture.componentRef.setInput('config', { ...SAMPLE_CONFIG, data: [] });
    fixture.detectChanges();

    const number = fixture.debugElement.query(By.css('span'));
    expect(number.nativeElement.textContent.trim()).toBe('0');
  });
});
