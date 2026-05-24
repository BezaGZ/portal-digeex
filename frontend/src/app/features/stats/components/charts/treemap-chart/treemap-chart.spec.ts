import { TestBed } from '@angular/core/testing';

import { TreemapChartComponent } from './treemap-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `TreemapChartComponent`.
 *
 * Wrapper de `<p-chart type="treemap">` usando `chartjs-chart-treemap`, el
 * plugin que suma `treemap` como controller registrable a Chart.js (Chart.js
 * no lo expone en su core). El componente adapta `ChartConfig` al shape que
 * el plugin pide (`tree`, `key`, `labels`), no al `{ labels, datasets }`
 * convencional de bar/pie.
 *
 * Ciclo 12 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'treemap',
  title: 'Programas',
  data: [
    { label: 'PEAC', value: 12450 },
    { label: 'PRONEA', value: 4820 },
    { label: 'CEMUCAF', value: 2100 },
    { label: 'TUTORADA', value: 980 },
  ],
};

describe('TreemapChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TreemapChartComponent] });
  });

  /**
   * El dataset arma `tree` como array de `{ label, value }` y declara `key:
   * 'value'` para que el plugin sepa qué campo numérico usar al calcular
   * las áreas. Sin `key`, el treemap renderea cuadros iguales.
   */
  it('should map ChartConfig.data to the treemap tree array with the value key', () => {
    const fixture = TestBed.createComponent(TreemapChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const ds = c.chartData().datasets[0] as {
      tree: Array<{ label: string; value: number }>;
      key: string;
      label: string;
    };
    expect(ds.tree).toEqual([
      { label: 'PEAC', value: 12450 },
      { label: 'PRONEA', value: 4820 },
      { label: 'CEMUCAF', value: 2100 },
      { label: 'TUTORADA', value: 980 },
    ]);
    expect(ds.key).toBe('value');
    expect(ds.label).toBe('Programas');
  });

  /**
   * `labels.display: true` pinta el nombre de cada rectángulo encima.
   * Sin esto el visitante ve cuadros de colores sin saber qué representan.
   */
  it('should enable in-tile labels so each rectangle shows its programa name', () => {
    const fixture = TestBed.createComponent(TreemapChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const ds = c.chartData().datasets[0] as {
      labels: { display: boolean };
    };
    expect(ds.labels.display).toBe(true);
  });

  /**
   * Leyenda y datalabels globales desactivados: la información ya está
   * adentro de cada rectángulo (nombre + valor), una leyenda separada
   * duplica y los datalabels del plugin global rompen el layout.
   */
  it('should disable the global legend and the datalabels plugin', () => {
    const fixture = TestBed.createComponent(TreemapChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartOptions.plugins.legend.display).toBe(false);
    expect(c.chartOptions.plugins.datalabels.display).toBe(false);
  });
});
