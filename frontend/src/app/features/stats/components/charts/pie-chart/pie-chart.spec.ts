import { TestBed } from '@angular/core/testing';

import { PieChartComponent } from './pie-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `PieChartComponent`.
 *
 * Wrapper de `<p-chart type="pie">` que adapta el shape `ChartConfig` del
 * proyecto al shape `{ labels, datasets }` que Chart.js espera. La paleta de
 * colores viaja inline (Chart.js no resuelve CSS vars en runtime).
 *
 * Ciclo 11 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'pie',
  title: 'Sexo',
  data: [
    { label: 'FEMENINO', value: 548 },
    { label: 'MASCULINO', value: 235 },
  ],
};

describe('PieChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PieChartComponent] });
  });

  /** chartData expone labels y un dataset con los valores en el mismo orden. */
  it('should map ChartConfig.data into Chart.js labels and datasets in order', () => {
    const fixture = TestBed.createComponent(PieChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartData().labels).toEqual(['FEMENINO', 'MASCULINO']);
    expect(c.chartData().datasets[0].data).toEqual([548, 235]);
  });

  /** El dataset trae una paleta inline para que Chart.js pinte los slices. */
  it('should attach an inline color palette to the dataset', () => {
    const fixture = TestBed.createComponent(PieChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const ds = c.chartData().datasets[0] as { backgroundColor: string[] };
    expect(Array.isArray(ds.backgroundColor)).toBe(true);
    expect(ds.backgroundColor.length).toBeGreaterThanOrEqual(2);
    expect(ds.backgroundColor[0]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  /** Sin config válido cae a labels y datasets vacíos sin lanzar. */
  it('should degrade to empty labels and datasets when config has no data', () => {
    const fixture = TestBed.createComponent(PieChartComponent);
    fixture.componentRef.setInput('config', { ...SAMPLE_CONFIG, data: [] });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartData().labels).toEqual([]);
    expect(c.chartData().datasets[0].data).toEqual([]);
  });
});
