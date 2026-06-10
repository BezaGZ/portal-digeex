import { describe, expect, it } from 'vitest';

import { LoadedReport, UsageReportType } from '../../../core/api/usage-report.model';
import {
  StatisticsPdfInput,
  buildStatisticsPdf,
  buildStatisticsSections,
} from './statistics-pdf-builder';

/**
 * Tests de `statistics-pdf-builder`.
 *
 * Builder puro del PDF de estadísticas de uso (reportes Solr Statistics de
 * DSpace 9: TotalVisits, TotalDownloads, TotalVisitsPerMonth). Se ejecuta
 * sin Angular y sin DOM: recibe data, devuelve un Blob. La composición de
 * secciones se valida vía `buildStatisticsSections` (modelo puro de datos)
 * y el blob final vía `buildStatisticsPdf`, reusando la infraestructura de
 * `shared/components/pdf/`.
 *
 * Ciclo 29 TDD — Sprint 8.
 */
describe('statistics-pdf-builder', () => {
  function buildReport(
    reportType: UsageReportType,
    points: NonNullable<LoadedReport['report']>['points'],
  ): LoadedReport {
    return { reportType, report: { id: `uuid_${reportType}`, reportType, points } };
  }

  function buildInput(overrides: Partial<StatisticsPdfInput> = {}): StatisticsPdfInput {
    return {
      dsoTitle: 'PEAC — Programa de Educación Acelerada',
      dsoType: 'item',
      reports: [
        buildReport('TotalVisits', [
          { id: 'p1', label: 'PEAC — Programa de Educación Acelerada', values: { views: 42 } },
        ]),
        buildReport('TotalDownloads', [
          { id: 'p2', label: 'guia.pdf', values: { downloads: 7 } },
          { id: 'p3', label: 'manual.pdf', values: { downloads: 3 } },
        ]),
        buildReport('TotalVisitsPerMonth', [
          { id: 'p4', label: 'May 2026', values: { views: 10 } },
          { id: 'p5', label: 'June 2026', values: { views: 12 } },
        ]),
      ],
      monthsBack: 12,
      generatedAt: new Date('2026-06-09T15:00:00Z'),
      handle: '123456789/42',
      ...overrides,
    };
  }

  // ─── Blob de salida ───────────────────────────────────

  /** Verifica que el builder devuelva un Blob PDF no vacío con el MIME correcto. */
  it('should return a non-empty blob with application/pdf MIME type', () => {
    const blob = buildStatisticsPdf(buildInput());

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });

  /** Verifica que el builder no mute el array de reports recibido (función pura). */
  it('should NOT mutate the reports input', () => {
    const input = buildInput();
    const snapshot = JSON.parse(JSON.stringify(input.reports));

    buildStatisticsPdf(input);

    expect(JSON.parse(JSON.stringify(input.reports))).toEqual(snapshot);
  });

  /** Verifica que los tres dsoType soportados generen PDF sin lanzar. */
  it('should accept site, item and collection dso types without throwing', () => {
    expect(() => buildStatisticsPdf(buildInput({ dsoType: 'site' }))).not.toThrow();
    expect(() => buildStatisticsPdf(buildInput({ dsoType: 'item' }))).not.toThrow();
    expect(() => buildStatisticsPdf(buildInput({ dsoType: 'collection' }))).not.toThrow();
  });

  // ─── Composición de secciones ─────────────────────────

  /** Verifica que se componga una sección por cada report no-null, omitiendo los fallidos. */
  it('should build one section per non-null report', () => {
    const input = buildInput({
      reports: [
        buildReport('TotalVisits', [{ id: 'p1', label: 'Item X', values: { views: 5 } }]),
        { reportType: 'TotalDownloads', report: null },
        buildReport('TotalVisitsPerMonth', [{ id: 'p2', label: 'June 2026', values: { views: 2 } }]),
      ],
    });

    const sections = buildStatisticsSections(input);

    expect(sections.map((s) => s.reportType)).toEqual(['TotalVisits', 'TotalVisitsPerMonth']);
  });

  /** Verifica que TotalVisits y TotalDownloads preserven el orden de points del backend, igual que la tabla en pantalla. */
  it('should preserve the points order from the report in table sections', () => {
    const input = buildInput({
      reports: [
        buildReport('TotalDownloads', [
          { id: 'p1', label: 'zeta.pdf', values: { downloads: 1 } },
          { id: 'p2', label: 'alfa.pdf', values: { downloads: 99 } },
          { id: 'p3', label: 'media.pdf', values: { downloads: 50 } },
        ]),
      ],
    });

    const [section] = buildStatisticsSections(input);

    expect(section.rows.map((r) => r[0])).toEqual(['zeta.pdf', 'alfa.pdf', 'media.pdf']);
  });

  /** Verifica que TotalVisitsPerMonth recorte el dataset a la ventana monthsBack usando generatedAt como referencia, igual que el grid. */
  it('should trim TotalVisitsPerMonth rows to the monthsBack window relative to generatedAt', () => {
    const input = buildInput({
      monthsBack: 3,
      generatedAt: new Date('2026-06-09T15:00:00Z'),
      reports: [
        buildReport('TotalVisitsPerMonth', [
          { id: 'p1', label: 'January 2026', values: { views: 1 } },
          { id: 'p2', label: 'April 2026', values: { views: 4 } },
          { id: 'p3', label: 'May 2026', values: { views: 5 } },
          { id: 'p4', label: 'June 2026', values: { views: 6 } },
        ]),
      ],
    });

    const [section] = buildStatisticsSections(input);

    expect(section.rows.map((r) => r[0])).toEqual(['Abr 2026', 'May 2026', 'Jun 2026']);
  });

  // ─── Casos borde ──────────────────────────────────────

  /** Verifica que un report con points vacío conserve su sección sin filas y el PDF se genere sin lanzar. */
  it('should keep an empty section when the report has no points', () => {
    const input = buildInput({
      reports: [buildReport('TotalVisits', [])],
    });

    const sections = buildStatisticsSections(input);

    expect(sections).toHaveLength(1);
    expect(sections[0].rows).toHaveLength(0);
    expect(() => buildStatisticsPdf(input)).not.toThrow();
  });

  /** Verifica el caso site: un único report TotalVisits genera una sola sección y PDF válido. */
  it('should build a single section for site input with only TotalVisits', () => {
    const input = buildInput({
      dsoType: 'site',
      dsoTitle: 'Repositorio institucional DIGEEX',
      handle: undefined,
      reports: [
        buildReport('TotalVisits', [
          { id: 'p1', label: 'Item A', values: { views: 12 } },
          { id: 'p2', label: 'Item B', values: { views: 8 } },
        ]),
      ],
    });

    const sections = buildStatisticsSections(input);

    expect(sections.map((s) => s.reportType)).toEqual(['TotalVisits']);
    expect(buildStatisticsPdf(input).size).toBeGreaterThan(0);
  });
});
