import { TestBed } from '@angular/core/testing';

import { HorizontalBarChartComponent } from './horizontal-bar-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `HorizontalBarChartComponent`.
 *
 * Wrapper de `<p-chart type="bar">` con `indexAxis: 'y'`. Pensado para
 * categorías con labels largos donde la vertical haría rotar el texto.
 *
 * Ciclo 11 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'horizontal-bar',
  title: 'Programas',
  data: [
    { label: 'MODALIDADES FLEXIBLES', value: 14897 },
    { label: 'PRONEA', value: 6305 },
    { label: 'CEMUCAF', value: 4200 },
  ],
};

describe('HorizontalBarChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HorizontalBarChartComponent] });
  });

  /** Configura indexAxis=y para que Chart.js renderice barras horizontales. */
  it('should set indexAxis to "y" in the chart options', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartOptions.indexAxis).toBe('y');
    expect(c.chartOptions.scales.x.beginAtZero).toBe(true);
  });

  /** Mapea data al shape de Chart.js preservando el orden. */
  it('should map ChartConfig.data into labels and dataset in order', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartData().labels).toEqual([
      'MODALIDADES FLEXIBLES',
      'PRONEA',
      'CEMUCAF',
    ]);
    expect(c.chartData().datasets[0].data).toEqual([14897, 6305, 4200]);
  });
});
