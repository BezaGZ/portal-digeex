import { TestBed } from '@angular/core/testing';

import { HistogramChartComponent } from './histogram-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `HistogramChartComponent`.
 *
 * Wrapper de `<p-chart type="bar">` con barras pegadas edge-to-edge para
 * reproducir el look de histograma del Tablero Consultor de DIGEEX. Pensado
 * para distribuciones de frecuencia por valor discreto (e.g. edad puntual
 * de estudiantes); el binning, si hace falta, se decide en el renderer.
 *
 * Ciclo 12 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'histogram',
  title: 'Edad',
  data: [
    { label: '6', value: 12 },
    { label: '7', value: 45 },
    { label: '8', value: 120 },
    { label: '9', value: 380 },
    { label: '10', value: 850 },
  ],
};

describe('HistogramChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HistogramChartComponent] });
  });

  /** Mapea labels y values en orden y reusa el title como label del dataset. */
  it('should preserve order of labels and values and reuse the title as dataset label', () => {
    const fixture = TestBed.createComponent(HistogramChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartData().labels).toEqual(['6', '7', '8', '9', '10']);
    expect(c.chartData().datasets[0].data).toEqual([12, 45, 120, 380, 850]);
    expect((c.chartData().datasets[0] as { label: string }).label).toBe('Edad');
  });

  /**
   * Barras pegadas edge-to-edge: barPercentage 1.0 y categoryPercentage 1.0
   * eliminan el gap horizontal típico de la bar chart. Sin esto, el chart
   * se ve igual que `BarChartComponent` y se pierde la semántica de
   * distribución continua que pide DIGEEX en el PowerBI.
   */
  it('should configure dataset bars edge-to-edge with barPercentage and categoryPercentage at 1.0', () => {
    const fixture = TestBed.createComponent(HistogramChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const ds = c.chartData().datasets[0] as { barPercentage: number; categoryPercentage: number };
    expect(ds.barPercentage).toBe(1.0);
    expect(ds.categoryPercentage).toBe(1.0);
  });

  /**
   * Datalabels off y autoSkip on en el eje X: con muchos bins (e.g. 70
   * edades) los valores sobre cada barra y los ticks de cada label generan
   * overlap ilegible. La densidad de barras ES la información.
   */
  it('should disable datalabels and enable autoSkip on the x axis ticks', () => {
    const fixture = TestBed.createComponent(HistogramChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartOptions.plugins.datalabels.display).toBe(false);
    expect(c.chartOptions.scales.x.ticks.autoSkip).toBe(true);
  });
});
