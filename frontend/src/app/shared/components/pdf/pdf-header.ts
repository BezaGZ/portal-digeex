import { jsPDF } from 'jspdf';

import { PDF_PALETTE } from './pdf-palette';

/**
 * Encabezado compartido de los PDFs del portal: banda azul gobierno con
 * "DIGEEX · GUATEMALA", el título que pasa cada reporte y la fecha de
 * emisión en español ("12 de junio de 2026, 14:32 GT").
 */
export function drawInstitutionalHeader(
  doc: jsPDF,
  pageWidth: number,
  reportTitle: string,
  generatedAt: Date,
): void {
  const bandHeight = 56;
  doc.setFillColor(PDF_PALETTE.primary);
  doc.rect(0, 0, pageWidth, bandHeight, 'F');

  doc.setTextColor(PDF_PALETTE.white);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DIGEEX · GUATEMALA', 40, 35);

  doc.setTextColor(PDF_PALETTE.primary);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, 40, bandHeight + 30);

  doc.setTextColor(PDF_PALETTE.textSecondary);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado el ${formatSpanishDateTime(generatedAt)}`, 40, bandHeight + 48);
}

/** Identificadores del DSO que el footer imprime para anclar el reporte al recurso. */
export interface PdfFooterIdentity {
  readonly handle?: string;
  readonly uuid?: string;
}

/**
 * Arma la línea identificadora del footer combinando el handle (identificador
 * estándar de DSpace) y el uuid (el que aparece en las URLs del portal), para
 * que un reporte impreso siempre lleve a su recurso. Devuelve `null` cuando
 * no hay ninguno y así el footer no pinta una etiqueta vacía.
 */
export function buildFooterIdentifier(identity: PdfFooterIdentity): string | null {
  const parts: string[] = [];
  if (identity.handle) parts.push(`Handle: ${identity.handle}`);
  if (identity.uuid) parts.push(`UUID: ${identity.uuid}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Pie de página en cada página: identificadores del recurso a la izquierda,
 * número de página a la derecha. Se dibuja al final porque jsPDF no conoce
 * el total de páginas hasta que el documento está completo.
 */
export function drawFooterOnAllPages(
  doc: jsPDF,
  pageWidth: number,
  identity: PdfFooterIdentity = {},
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const footerY = pageHeight - 24;
  const identifier = buildFooterIdentifier(identity);

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
    doc.setPage(pageIndex);
    doc.setDrawColor(PDF_PALETTE.border);
    doc.setLineWidth(0.5);
    doc.line(marginX, footerY - 12, pageWidth - marginX, footerY - 12);

    doc.setTextColor(PDF_PALETTE.textTertiary);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    if (identifier) {
      doc.text(identifier, marginX, footerY);
    }
    doc.text(
      `Página ${pageIndex} de ${pageCount}`,
      pageWidth - marginX,
      footerY,
      { align: 'right' },
    );
  }
}

/**
 * Fecha-hora en español de Guatemala ("12 de junio de 2026, 14:32 GT"),
 * con `Intl` y timezone `America/Guatemala` para no depender del browser.
 */
export function formatSpanishDateTime(date: Date): string {
  const formatter = new Intl.DateTimeFormat('es-GT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Guatemala',
  });
  return `${formatter.format(date)} GT`;
}
