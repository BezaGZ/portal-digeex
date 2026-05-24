import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ChartSectionComponent } from './chart-section';
import { ChartSection } from '../../../models/stats-dashboard.model';
import { KpiCardComponent } from '../kpi-card/kpi-card';
import { PieChartComponent } from '../pie-chart/pie-chart';
import { BarChartComponent } from '../bar-chart/bar-chart';
import { HorizontalBarChartComponent } from '../horizontal-bar-chart/horizontal-bar-chart';

/**
 * Tests de `ChartSectionComponent`.
 *
 * Renderiza una sección del `StatsDashboard` despachando cada `ChartConfig`
 * al componente concreto según `type`. KPIs van en grid horizontal; pie,
 * bar y horizontal-bar se apilan. `histogram` y `treemap` muestran un
 * placeholder textual hasta que sus componentes concretos aterricen.
 *
 * Ciclo 11 TDD — Sprint 7.
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
   * Tipos de chart sin componente registrado (histogram, treemap) no
   * renderizan nada: el header de la sección queda visible pero el cuerpo
   * vacío. Es preferible el silencio a un placeholder textual que ensucia
   * la UI; cuando el componente concreto aterrice el switch lo dispacha.
   */
  it('should not render any placeholder for chart types without a concrete component', () => {
    const section: ChartSection = {
      title: 'Pendientes',
      charts: [
        { type: 'histogram', title: 'Edad', data: [{ label: '10', value: 1 }] },
        { type: 'treemap', title: 'Programas', data: [{ label: 'A', value: 1 }] },
      ],
    };
    const fixture = TestBed.createComponent(ChartSectionComponent);
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('pendiente');
    expect(text).not.toContain('Tipo de gráfica');
  });
});
