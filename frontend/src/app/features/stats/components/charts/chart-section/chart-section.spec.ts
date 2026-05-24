import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ChartSectionComponent } from './chart-section';
import { ChartSection } from '../../../models/stats-dashboard.model';
import { KpiCardComponent } from '../kpi-card/kpi-card';
import { PieChartComponent } from '../pie-chart/pie-chart';
import { BarChartComponent } from '../bar-chart/bar-chart';
import { HorizontalBarChartComponent } from '../horizontal-bar-chart/horizontal-bar-chart';
import { HistogramChartComponent } from '../histogram-chart/histogram-chart';
import { TreemapChartComponent } from '../treemap-chart/treemap-chart';

/**
 * Tests de `ChartSectionComponent`.
 *
 * Renderiza una sección del `StatsDashboard` despachando cada `ChartConfig`
 * al componente concreto según `type`. KPIs van en grid horizontal; pie,
 * bar, horizontal-bar, list, tags, histogram y treemap se apilan vertical.
 *
 * Ciclo 11 TDD — Sprint 7. Ajustado en Ciclo 12 (Sprint 7) cuando aterrizaron
 * los wrappers concretos de `histogram` y `treemap`.
 */

describe('ChartSectionComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ChartSectionComponent] });
  });

  /** Cuando todos los charts son `kpi`, isKpiSection es true y renderiza KpiCard. */
  it('should detect a KPI-only section and render KpiCardComponent per chart', () => {
    const section: ChartSection = {
      title: 'Indicadores',
      charts: [
        { type: 'kpi', title: 'A', data: [{ label: 'A', value: 1 }] },
        { type: 'kpi', title: 'B', data: [{ label: 'B', value: 2 }] },
      ],
    };
    const fixture = TestBed.createComponent(ChartSectionComponent);
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();

    expect(fixture.componentInstance.isKpiSection()).toBe(true);
    expect(fixture.debugElement.queryAll(By.directive(KpiCardComponent)).length).toBe(2);
  });

  /** Sección con pie despacha al PieChartComponent. */
  it('should dispatch a pie chart to PieChartComponent', () => {
    const section: ChartSection = {
      title: 'Distribución',
      charts: [{ type: 'pie', title: 'Sexo', data: [{ label: 'X', value: 1 }] }],
    };
    const fixture = TestBed.createComponent(ChartSectionComponent);
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(PieChartComponent))).toBeTruthy();
  });

  /** Sección con bar y horizontal-bar despacha a los wrappers correctos. */
  it('should dispatch bar and horizontal-bar charts to their respective wrappers', () => {
    const section: ChartSection = {
      title: 'Tipos',
      charts: [
        { type: 'bar', title: 'A', data: [{ label: 'X', value: 1 }] },
        { type: 'horizontal-bar', title: 'B', data: [{ label: 'Y', value: 2 }] },
      ],
    };
    const fixture = TestBed.createComponent(ChartSectionComponent);
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(BarChartComponent))).toBeTruthy();
    expect(fixture.debugElement.query(By.directive(HorizontalBarChartComponent))).toBeTruthy();
  });

  /**
   * Histogram y treemap despachan a `HistogramChartComponent` y
   * `TreemapChartComponent`. Antes del Ciclo 12 estos dos types eran
   * silencio intencional; ahora que sus wrappers existen, el dispatcher los
   * pinta como cualquier otro chart-type del `@switch`.
   */
  it('should dispatch histogram and treemap charts to their respective wrappers', () => {
    const section: ChartSection = {
      title: 'Demografía y programas',
      charts: [
        { type: 'histogram', title: 'Edad', data: [{ label: '10', value: 1 }] },
        { type: 'treemap', title: 'Programas', data: [{ label: 'A', value: 1 }] },
      ],
    };
    const fixture = TestBed.createComponent(ChartSectionComponent);
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(HistogramChartComponent))).toBeTruthy();
    expect(fixture.debugElement.query(By.directive(TreemapChartComponent))).toBeTruthy();
  });
});
