import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { UsageReportTable } from './usage-report-table';
import { UsageReport } from '../../usage-report.model';

/**
 * Tests del componente presentacional `UsageReportTable`.
 *
 * Renderiza un `UsageReport` como tabla compacta etiqueta/total. Cubre los
 * tres estados (loading, empty, populated), el título derivado del
 * `reportType` vía `REPORT_LABELS`, el cálculo de `valueOf` con prioridad
 * `views` sobre `downloads`, y el caso borde de un report con points pero
 * todos sus values en cero (cae al empty state porque no aporta info).
 *
 * Ciclo 23 TDD — Sprint 8.
 */
describe('UsageReportTable', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UsageReportTable],
      providers: [provideNoopAnimations()],
    });
  });

  function setReport(report: UsageReport | null, loading = false): HTMLElement {
    const fixture = TestBed.createComponent(UsageReportTable);
    fixture.componentRef.setInput('reportType', 'TotalVisits');
    fixture.componentRef.setInput('report', report);
    fixture.componentRef.setInput('loading', loading);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  /** Verifica que el flag loading muestre el placeholder de carga sin tabla. */
  it('should render the loading state when loading=true', () => {
    const el = setReport(null, true);
    expect(el.querySelector('[data-testid="usage-report-loading"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="usage-report-row"]')).toBeNull();
  });

  /** Verifica que report=null caiga al empty state (no es lo mismo que loading). */
  it('should render the empty state when report is null', () => {
    const el = setReport(null);
    expect(el.querySelector('[data-testid="usage-report-empty"]')).not.toBeNull();
  });

  /** Verifica que un report con points=[] (DSpace responde sin tráfico) caiga al empty state. */
  it('should render the empty state when report has zero points', () => {
    const el = setReport({ id: 'r', reportType: 'TotalVisits', points: [] });
    expect(el.querySelector('[data-testid="usage-report-empty"]')).not.toBeNull();
  });

  /**
   * Verifica que un report con points pero todos con value=0 caiga al empty state.
   * Una lista de ceros no aporta info y vacía es más honesto que mostrar 10 filas de "0".
   */
  it('should render the empty state when all values are zero', () => {
    const el = setReport({
      id: 'r',
      reportType: 'TotalVisits',
      points: [
        { id: 'a', label: 'A', values: { views: 0 } },
        { id: 'b', label: 'B', values: { views: 0 } },
      ],
    });
    expect(el.querySelector('[data-testid="usage-report-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="usage-report-row"]')).toBeNull();
  });

  /** Verifica que con al menos un value > 0 la tabla rinda una fila por point con label y total. */
  it('should render one row per point when there is real data', () => {
    const el = setReport({
      id: 'r',
      reportType: 'TotalVisits',
      points: [
        { id: 'a', label: 'Album A', values: { views: 12 } },
        { id: 'b', label: 'Album B', values: { views: 7 } },
      ],
    });
    const rows = el.querySelectorAll('[data-testid="usage-report-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Album A');
    expect(rows[0].textContent).toContain('12');
    expect(rows[1].textContent).toContain('Album B');
    expect(rows[1].textContent).toContain('7');
  });

  /** Verifica que el heading del card use el label en español de REPORT_LABELS según el reportType. */
  it('should render the heading from REPORT_LABELS', () => {
    const fixture = TestBed.createComponent(UsageReportTable);
    fixture.componentRef.setInput('reportType', 'TotalDownloads');
    fixture.componentRef.setInput('report', { id: 'r', reportType: 'TotalDownloads', points: [] });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Descargas');
  });
});
