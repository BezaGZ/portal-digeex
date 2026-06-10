import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  MONTH_SHORT_ES,
  applyMonthlyWindow,
  parseMonthLabel,
} from '../../../core/api/monthly-window.util';
import {
  LoadedReport,
  REPORT_LABELS,
  UsageReportDsoType,
  UsageReportType,
} from '../../../core/api/models/usage-report.model';
import { drawFooterOnAllPages, drawInstitutionalHeader } from '../pdf/pdf-header';
import { PDF_PALETTE } from '../pdf/pdf-palette';
import { PDF_TABLE_BASE_OPTIONS } from '../pdf/pdf-table';

const DSO_TYPE_LABELS: Readonly<Record<UsageReportDsoType, string>> = {
  site: 'REPOSITORIO',
  item: 'ITEM',
  collection: 'PROGRAMA',
};

/**
 * Modelo puro de una sección del PDF: título traducido, columnas y filas ya
 * formateadas. Separar el cálculo del dibujo permite revisar el contenido
 * sin abrir el binario.
 */
export interface StatisticsSection {
  readonly reportType: UsageReportType;
  readonly heading: string;
  readonly columns: readonly [string, string];
  readonly rows: readonly (readonly [string, string])[];
}

/**
 * Todo lo que el PDF necesita para armarse, sin depender del componente ni
 * de Angular. `monthsBack` recorta el reporte mensual con la misma ventana
 * que el chart en pantalla; `generatedAt` es la fecha de referencia.
 */
export interface StatisticsPdfInput {
  readonly dsoTitle: string;
  readonly dsoType: UsageReportDsoType;
  readonly reports: readonly LoadedReport[];
  readonly monthsBack: number | null;
  readonly generatedAt: Date;
  readonly handle?: string;
  readonly uuid?: string;
}

/**
 * Construye el PDF de estadísticas de uso y devuelve un `Blob` listo para
 * descargar. No toca el DOM ni muta el input; la apariencia vive en
 * `shared/components/pdf/`.
 */
export function buildStatisticsPdf(input: StatisticsPdfInput): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawInstitutionalHeader(doc, pageWidth, 'Reporte de estadísticas de uso', input.generatedAt);
  let cursorY = drawDsoCard(doc, pageWidth, input);
  for (const section of buildStatisticsSections(input)) {
    cursorY = drawSection(doc, cursorY, section);
  }
  drawFooterOnAllPages(doc, pageWidth, { handle: input.handle, uuid: input.uuid });

  return doc.output('blob');
}

/**
 * Arma las secciones a partir de los reports cargados. Los que vienen en
 * `null` (fallaron al cargar en pantalla) se omiten: el PDF refleja lo que
 * el usuario ve, no lo que el backend no pudo responder.
 */
export function buildStatisticsSections(input: StatisticsPdfInput): StatisticsSection[] {
  return input.reports
    .filter((entry): entry is LoadedReport & { report: NonNullable<LoadedReport['report']> } =>
      entry.report !== null,
    )
    .map((entry) =>
      entry.reportType === 'TotalVisitsPerMonth'
        ? buildMonthlySection(entry.report.points, input.monthsBack, input.generatedAt)
        : {
            reportType: entry.reportType,
            heading: REPORT_LABELS[entry.reportType],
            columns: [
              'Recurso',
              entry.reportType === 'TotalDownloads' ? 'Descargas' : 'Visitas',
            ] as const,
            rows: entry.report.points.map(
              (p) => [p.label, String(p.values.views ?? p.values.downloads ?? 0)] as const,
            ),
          },
    );
}

/**
 * Sección mensual con los mismos pasos que el chart en pantalla: parseo del
 * label "Month YYYY", orden cronológico y ventana `monthsBack` con
 * `generatedAt` como referencia, para que PDF y pantalla muestren lo mismo.
 */
function buildMonthlySection(
  points: NonNullable<LoadedReport['report']>['points'],
  monthsBack: number | null,
  generatedAt: Date,
): StatisticsSection {
  const parsedAll = points
    .map((p) => {
      const meta = parseMonthLabel(p.label);
      if (!meta) return null;
      return { ...meta, value: p.values.views ?? p.values.downloads ?? 0 };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx));

  const parsed = applyMonthlyWindow(parsedAll, monthsBack, generatedAt);

  return {
    reportType: 'TotalVisitsPerMonth',
    heading: REPORT_LABELS['TotalVisitsPerMonth'],
    columns: ['Mes', 'Visitas'] as const,
    rows: parsed.map((p) => [`${MONTH_SHORT_ES[p.monthIdx]} ${p.year}`, String(p.value)] as const),
  };
}

/**
 * Dibuja una sección como título + tabla con la paleta institucional.
 * Devuelve la Y final para encadenar la siguiente sección.
 */
function drawSection(doc: jsPDF, startY: number, section: StatisticsSection): number {
  doc.setTextColor(PDF_PALETTE.primary);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(section.heading, 40, startY);

  // Sin tráfico capturado: placeholder en lugar de una tabla vacía, para que
  // el auditor distinga "cero datos" de un reporte que falló en cargar.
  if (section.rows.length === 0) {
    doc.setTextColor(PDF_PALETTE.textSecondary);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Sin datos registrados para este reporte.', 40, startY + 18);
    return startY + 46;
  }

  autoTable(doc, {
    ...PDF_TABLE_BASE_OPTIONS,
    startY: startY + 10,
    head: [section.columns as [string, string]],
    body: section.rows.map((r) => [...r]),
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 100, halign: 'right' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((doc as any).lastAutoTable?.finalY ?? startY + 10) + 28;
}

/**
 * Tarjeta del DSO: label superior con el tipo en azul acento y título del
 * recurso con word-wrap. Devuelve la Y del cursor para el siguiente bloque.
 */
function drawDsoCard(doc: jsPDF, pageWidth: number, input: StatisticsPdfInput): number {
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;
  let y = 130;

  doc.setTextColor(PDF_PALETTE.primaryAccent);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(DSO_TYPE_LABELS[input.dsoType], marginX, y);
  y += 16;

  doc.setTextColor(PDF_PALETTE.textPrimary);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(input.dsoTitle, contentWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 16;

  doc.setDrawColor(PDF_PALETTE.border);
  doc.setLineWidth(0.5);
  doc.line(marginX, y + 12, pageWidth - marginX, y + 12);

  return y + 28;
}
