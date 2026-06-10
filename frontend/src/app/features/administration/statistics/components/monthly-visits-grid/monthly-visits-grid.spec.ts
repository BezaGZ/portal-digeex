import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { MonthlyVisitsGrid } from './monthly-visits-grid';
import { UsageReport } from '../../../../../core/api/usage-report.model';

/**
 * Tests del componente presentacional `MonthlyVisitsGrid`.
 *
 * Renderiza el reporte `TotalVisitsPerMonth` como gráfico de barras
 * horizontales con `<p-chart>` de PrimeNG. Cubre los tres estados
 * (loading, empty, populated), el parseo de labels del backend en formato
 * "December 2025" a etiqueta corta en español ("Dic 2025"), el orden
 * cronológico ascendente del dataset, el caso borde de points con label
 * desconocido (se ignoran sin romper la grilla), y la altura dinámica del
 * card proporcional al número de puntos para que el chart respete el
 * espacio sin dejar área vacía.
 *
 * Ciclo 23 TDD — Sprint 8. Ajustado en Ciclos 28 y 29 (Sprint 8).
 */
describe('MonthlyVisitsGrid', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MonthlyVisitsGrid],
      providers: [provideNoopAnimations()],
    });
  });

  function render(report: UsageReport | null, loading = false, monthsBack?: number) {
    const fixture = TestBed.createComponent(MonthlyVisitsGrid);
    fixture.componentRef.setInput('report', report);
    fixture.componentRef.setInput('loading', loading);
    if (monthsBack !== undefined) {
      fixture.componentRef.setInput('monthsBack', monthsBack);
    }
    fixture.detectChanges();
    return fixture;
  }

  /** Construye `count` points consecutivos, el primero en `referenceDate` y retrocediendo un mes por cada índice. */
  function buildMonthlyPoints(referenceDate: Date, count: number) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      return { id: `p-${i}`, label, values: { views: count - i } };
    });
  }

  /** Verifica que loading muestre el placeholder de carga y oculte el chart. */
  it('should render loading state when loading=true', () => {
    const fx = render(null, true);
    expect(fx.nativeElement.querySelector('[data-testid="monthly-visits-loading"]')).not.toBeNull();
  });

  /** Verifica que report=null caiga al empty state sin intentar montar el chart. */
  it('should render empty state when report is null', () => {
    const fx = render(null);
    expect(fx.nativeElement.querySelector('[data-testid="monthly-visits-empty"]')).not.toBeNull();
  });

  /** Verifica que un report con points todos en cero degrade a empty state (un chart de ceros no aporta info). */
  it('should render empty state when all values are zero', () => {
    const fx = render({
      id: 'r',
      reportType: 'TotalVisitsPerMonth',
      points: [
        { id: 'a', label: 'January 2026', values: { views: 0 } },
        { id: 'b', label: 'February 2026', values: { views: 0 } },
      ],
    });
    expect(fx.nativeElement.querySelector('[data-testid="monthly-visits-empty"]')).not.toBeNull();
    expect(fx.nativeElement.querySelector('[data-testid="monthly-visits-chart"]')).toBeNull();
  });

  /** Verifica que con al menos un value positivo monte el `<p-chart>` con su data-testid. */
  it('should render the chart when at least one value is greater than zero', () => {
    const fx = render({
      id: 'r',
      reportType: 'TotalVisitsPerMonth',
      points: [
        { id: 'a', label: 'January 2026', values: { views: 5 } },
        { id: 'b', label: 'February 2026', values: { views: 3 } },
      ],
    });
    expect(fx.nativeElement.querySelector('[data-testid="monthly-visits-chart"]')).not.toBeNull();
  });

  /**
   * Verifica que el dataset se ordene cronológicamente ascendente y los labels se traduzcan al español corto.
   * El backend manda "December 2025" y el componente lo renderiza como "Dic 2025" para coherencia con el resto del portal.
   */
  it('should build the dataset sorted chronologically asc and translate month labels to ES', () => {
    const fx = render({
      id: 'r',
      reportType: 'TotalVisitsPerMonth',
      points: [
        { id: 'a', label: 'March 2026', values: { views: 9 } },
        { id: 'b', label: 'January 2025', values: { views: 2 } },
        { id: 'c', label: 'December 2025', values: { views: 7 } },
      ],
    });
    const data = fx.componentInstance.data;
    expect(data?.labels).toEqual(['Ene 2025', 'Dic 2025', 'Mar 2026']);
    expect(data?.datasets[0].data).toEqual([2, 7, 9]);
  });

  /** Verifica que las options de Chart.js tengan indexAxis='y' para que las barras crezcan horizontal de izquierda a derecha. */
  it('should configure horizontal bars via indexAxis=y in chart options', () => {
    const fx = render({
      id: 'r',
      reportType: 'TotalVisitsPerMonth',
      points: [{ id: 'a', label: 'May 2025', values: { views: 4 } }],
    });
    expect(fx.componentInstance.options?.indexAxis).toBe('y');
  });

  /** Verifica que chartHeight escale como `count*36 + 60` cuando supera el mínimo, para reservar fila + escala X. */
  it('should scale chart height proportionally to the number of points', () => {
    const fx = render({
      id: 'r',
      reportType: 'TotalVisitsPerMonth',
      points: [
        { id: 'a', label: 'January 2025', values: { views: 1 } },
        { id: 'b', label: 'February 2025', values: { views: 1 } },
        { id: 'c', label: 'March 2025', values: { views: 1 } },
        { id: 'd', label: 'April 2025', values: { views: 1 } },
        { id: 'e', label: 'May 2025', values: { views: 1 } },
        { id: 'f', label: 'June 2025', values: { views: 1 } },
        { id: 'g', label: 'July 2025', values: { views: 1 } },
        { id: 'h', label: 'August 2025', values: { views: 1 } },
      ],
    });
    // 8 puntos * 36 + 60 = 348, mayor que el minimo 280
    expect(fx.componentInstance.chartHeight()).toBe(348);
  });

  /** Verifica que con pocos points chartHeight respete el mínimo de 280px para que el card no quede demasiado bajo. */
  it('should apply the minimum chart height when there are few points', () => {
    const fx = render({
      id: 'r',
      reportType: 'TotalVisitsPerMonth',
      points: [{ id: 'a', label: 'May 2025', values: { views: 4 } }],
    });
    expect(fx.componentInstance.chartHeight()).toBe(280);
  });

  /**
   * Verifica que cuando `monthsBack` es un número finito el dataset se recorte
   * a los últimos N meses. El filtrado pasa de runtime en frontend usando el
   * label parseado del point contra la ventana hoy → hoy - monthsBack.
   */
  it('should clip dataset to the last N months when monthsBack is provided', () => {
    const points = buildMonthlyPoints(new Date(), 24);
    const fx = render(
      { id: 'r', reportType: 'TotalVisitsPerMonth', points },
      false,
      6,
    );
    expect(fx.componentInstance.data?.labels?.length).toBe(6);
  });

  /** Verifica que sin `monthsBack` el dataset incluya todos los points (default = sin filtro). */
  it('should include all parseable points when monthsBack is null', () => {
    const points = buildMonthlyPoints(new Date(), 24);
    const fx = render({ id: 'r', reportType: 'TotalVisitsPerMonth', points });
    expect(fx.componentInstance.data?.labels?.length).toBe(24);
  });

  /** Verifica que labels con formato inesperado se descarten sin romper el dataset (tolerancia a inputs corruptos). */
  it('should ignore points with unparseable label without breaking', () => {
    const fx = render({
      id: 'r',
      reportType: 'TotalVisitsPerMonth',
      points: [
        { id: 'a', label: 'whatever', values: { views: 10 } },
        { id: 'b', label: 'May 2025', values: { views: 4 } },
      ],
    });
    const data = fx.componentInstance.data;
    expect(data?.labels).toEqual(['May 2025']);
    expect(data?.datasets[0].data).toEqual([4]);
  });
});
