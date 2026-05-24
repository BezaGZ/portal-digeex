import { TestBed } from '@angular/core/testing';

import { BarChartComponent } from './bar-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `BarChartComponent`.
 *
 * Wrapper de `<p-chart type="bar">` con barras verticales. Adapta
 * `ChartConfig` al shape `{ labels, datasets }` de Chart.js y oculta la
 * leyenda porque la bar chart típica del proyecto solo tiene una serie.
 *
 * Ciclo 11 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'bar',
  title: 'Tipos de contrato',
  data: [
    { label: 'TECNICO ITINERANTE', value: 320 },
    { label: 'TECNICO PRONEA', value: 180 },
    { label: 'TECNICO DE EDUCACION II', value: 90 },
  ],
};

describe('BarChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BarChartComponent] });
  });

  /** Mapea labels y values en orden y preserva el title como label del dataset. */
  it('should preserve order of labels and values and reuse the title as dataset label', () => {
    const fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartData().labels).toEqual([
      'TECNICO ITINERANTE',
      'TECNICO PRONEA',
      'TECNICO DE EDUCACION II',
    ]);
    expect(c.chartData().datasets[0].data).toEqual([320, 180, 90]);
    expect((c.chartData().datasets[0] as { label: string }).label).toBe('Tipos de contrato');
  });

  /** chartOptions oculta la leyenda y el eje Y arranca en cero. */
  it('should hide the legend and start the y axis at zero', () => {
    const fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartOptions.plugins.legend.display).toBe(false);
    expect(c.chartOptions.scales.y.beginAtZero).toBe(true);
  });
});
