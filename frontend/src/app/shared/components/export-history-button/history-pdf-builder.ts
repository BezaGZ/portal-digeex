import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  PROVENANCE_ACTION_LABELS,
  PROVENANCE_PHRASES,
} from '../../../core/provenance/action-labels';
import { TimelineEntry } from '../../../core/provenance/timeline-entry.model';
import {
  drawFooterOnAllPages,
  drawInstitutionalHeader,
  formatSpanishDateTime,
} from '../pdf/pdf-header';
import { PDF_PALETTE } from '../pdf/pdf-palette';
import { PDF_TABLE_BASE_OPTIONS } from '../pdf/pdf-table';

/** Tipos de DSO soportados por el reporte; cada uno mapea a su etiqueta en `DSO_TYPE_LABELS`. */
export type HistoryDsoType = 'item' | 'programa' | 'subdireccion';

const DSO_TYPE_LABELS: Readonly<Record<HistoryDsoType, string>> = {
  item: 'ITEM',
  programa: 'PROGRAMA',
  subdireccion: 'SUBDIRECCIÓN',
};

/**
 * Input del builder: todo lo que el PDF necesita para armarse, sin acoplar
 * al componente UI ni al framework. Cualquier consumidor que tenga estos
 * datos puede generar el reporte (Angular, script de Node, test, etc.).
 */
export interface HistoryPdfInput {
  readonly dsoTitle: string;
  readonly dsoSubtitle?: string;
  readonly dsoDescription?: string;
  readonly dsoType: HistoryDsoType;
  readonly entries: readonly TimelineEntry[];
  readonly handle?: string;
  readonly uuid?: string;
  readonly generatedAt: Date;
}

/**
 * Construye el PDF del historial y devuelve un `Blob` listo para descargar.
 * Función pura: no toca el DOM, no asume Angular, no muta el input. La
 * apariencia vive en `PDF_PALETTE` y los textos en `PROVENANCE_ACTION_LABELS`
 * y `DSO_TYPE_LABELS`.
 */
export function buildHistoryPdf(input: HistoryPdfInput): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawInstitutionalHeader(doc, pageWidth, 'Reporte de historial de actividad', input.generatedAt);
  const cursorY = drawDsoCard(doc, pageWidth, input);
  drawEntriesTable(doc, cursorY, input.entries);
  drawFooterOnAllPages(doc, pageWidth, { handle: input.handle, uuid: input.uuid });

  return doc.output('blob');
}

/**
 * Tarjeta del DSO: label superior con el tipo en azul acento, título grande,
 * subtítulo si aplica (sigla / autor / sufijo), descripción opcional con
 * word-wrap a `pageWidth - margen`. Devuelve la Y del cursor para que el
 * siguiente bloque sepa dónde empezar.
 */
function drawDsoCard(doc: jsPDF, pageWidth: number, input: HistoryPdfInput): number {
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

  if (input.dsoSubtitle) {
    doc.setTextColor(PDF_PALETTE.textSecondary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(input.dsoSubtitle, marginX, y);
    y += 14;
  }

  if (input.dsoDescription) {
    doc.setTextColor(PDF_PALETTE.textPrimary);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const descriptionLines = doc.splitTextToSize(input.dsoDescription, contentWidth);
    doc.text(descriptionLines, marginX, y + 8);
    y += descriptionLines.length * 12 + 12;
  }

  // Línea separadora sutil antes de la tabla
  doc.setDrawColor(PDF_PALETTE.border);
  doc.setLineWidth(0.5);
  doc.line(marginX, y + 12, pageWidth - marginX, y + 12);

  return y + 28;
}

/**
 * Tabla de eventos con `jspdf-autotable`. Cada entry del provenance se mapea
 * a una fila con Fecha / Actor / Acción / Detalle. Se ordena descendente por
 * timestamp (más reciente arriba); los entries con timestamp null caen al
 * final. La paleta del autotable se inyecta desde `PDF_PALETTE` — header en
 * azul gobierno, filas alternadas para legibilidad.
 */
function drawEntriesTable(
  doc: jsPDF,
  startY: number,
  entries: readonly TimelineEntry[],
): void {
  const sorted = sortEntriesDescending(entries);
  const rows = sorted.map((entry) => [
    entry.timestamp ? formatSpanishDate(entry.timestamp) : '—',
    entry.actor ?? '—',
    PROVENANCE_ACTION_LABELS[entry.action] ?? entry.action,
    humanizeProvenanceDetail(entry.raw),
  ]);

  autoTable(doc, {
    ...PDF_TABLE_BASE_OPTIONS,
    startY,
    head: [['Fecha', 'Actor', 'Acción', 'Detalle']],
    body: rows,
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 110 },
      2: { cellWidth: 70 },
      3: { cellWidth: 'auto' },
    },
  });
}

/**
 * Orden cronológico descendente. Los entries sin timestamp se hunden al
 * final de la lista para que la cabecera del reporte muestre lo más reciente.
 */
function sortEntriesDescending(entries: readonly TimelineEntry[]): readonly TimelineEntry[] {
  return [...entries].sort((a, b) => {
    if (a.timestamp && b.timestamp) return b.timestamp.getTime() - a.timestamp.getTime();
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return 0;
  });
}

/** Formato fecha sin hora para las filas de la tabla. */
function formatSpanishDate(date: Date): string {
  return new Intl.DateTimeFormat('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Guatemala',
  }).format(date);
}

/**
 * Traduce el texto crudo del `dc.description.provenance` al español. El
 * pipeline aplica tres pasos en orden: normalizar timestamps ISO UTC a la
 * zona horaria Guatemala, reescribir el patrón inglés canónico al español
 * y traducir frases sueltas del cabecero de bitstreams. Cada paso es una
 * función pura que opera sobre el output del anterior; si un raw no
 * matchea algún patrón el paso lo deja sin tocar.
 */
function humanizeProvenanceDetail(raw: string): string {
  const withLocalDates = replaceIsoTimestamps(raw);
  const withPattern = translateProvenancePattern(withLocalDates);
  return translateLooseProvenancePhrases(withPattern);
}

/**
 * Reemplaza cada timestamp ISO 8601 UTC del texto por su equivalente en
 * `es-GT` con timezone `America/Guatemala`. Patrón conservador (`\b...Z\b`)
 * para no tocar otras secuencias numéricas con guiones.
 */
function replaceIsoTimestamps(input: string): string {
  return input.replace(
    /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z\b/g,
    (match, year, month, day, hours, minutes, seconds) => {
      const isoUtc = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
      const date = new Date(isoUtc);
      return Number.isFinite(date.getTime()) ? formatSpanishDateTime(date) : match;
    },
  );
}

/**
 * Reescribe la frase canónica de DSpace `"{Action} by {actor} on {date}"` al
 * español `"{Acción} por {actor} el {date}"`. Usa `PROVENANCE_ACTION_LABELS`
 * para traducir la acción y deja pasar todo lo demás cuando el patrón no
 * matchea. La clase `[\s\S]+?` (no `.+?`) permite que la captura cruce
 * saltos de línea, ya que el raw incluye múltiples líneas con bitstreams
 * y checksum después del timestamp. Solo opera sobre la primera ocurrencia.
 */
function translateProvenancePattern(input: string): string {
  const match = input.match(/^([^\n]+?) by ([^\n]+?) on ([\s\S]+?)(\.|$)([\s\S]*)$/);
  if (!match) return input;
  const [, englishAction, actor, date, terminator, rest] = match;
  const spanishAction = PROVENANCE_ACTION_LABELS[englishAction] ?? englishAction;

  return `${spanishAction} por ${actor} el ${date}${terminator}${rest}`;
}

/**
 * Reemplaza las frases inglesas que DSpace embebe en el cabecero del
 * bitstream (cantidad, checksum, fecha previa de publicación, sufijo GMT)
 * con el mapa `PROVENANCE_PHRASES`.
 */
function translateLooseProvenancePhrases(input: string): string {
  let result = input;
  for (const [english, spanish] of PROVENANCE_PHRASES) {
    result = result.split(english).join(spanish);
  }
  return result;
}

