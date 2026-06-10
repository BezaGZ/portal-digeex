import { UserOptions } from 'jspdf-autotable';

import { PDF_PALETTE } from './pdf-palette';

/**
 * Estilos base de las tablas de los PDFs institucionales: header azul
 * gobierno, filas alternadas y márgenes del layout A4. Cada reporte agrega
 * sus `columnStyles` propios vía spread.
 */
export const PDF_TABLE_BASE_OPTIONS = {
  theme: 'striped',
  headStyles: {
    fillColor: PDF_PALETTE.primary,
    textColor: PDF_PALETTE.white,
    fontStyle: 'bold',
    fontSize: 10,
    cellPadding: 8,
  },
  bodyStyles: {
    fontSize: 9,
    textColor: PDF_PALETTE.textPrimary,
    cellPadding: 6,
  },
  alternateRowStyles: {
    fillColor: PDF_PALETTE.rowAlternate,
  },
  margin: { left: 40, right: 40 },
} satisfies Partial<UserOptions>;
