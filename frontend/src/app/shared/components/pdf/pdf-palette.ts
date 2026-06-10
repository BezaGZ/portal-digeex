import { INSTITUTIONAL_COLORS } from '../../../core/theme/institutional-colors';

/**
 * Paleta compartida de los PDFs institucionales. Los tonos de identidad
 * (`primary`, `primaryAccent`, `white`) leen de `INSTITUTIONAL_COLORS` para
 * no duplicar la fuente; los grises van como hex de la escala Tailwind
 * porque el PDF se genera sin Tailwind ni DOM.
 */
export const PDF_PALETTE = {
  /** Encabezado del PDF, headers de tabla, títulos de sección. */
  primary: INSTITUTIONAL_COLORS.govBlue,
  /** Subtítulos, badges, líneas de énfasis. */
  primaryAccent: INSTITUTIONAL_COLORS.govBlueAccent,
  /** Texto sobre fondos institucionales. */
  white: INSTITUTIONAL_COLORS.surface,

  /** Texto principal del body (Tailwind gray-800). */
  textPrimary: '#1F2937',
  /** Texto secundario: metadata, fechas, footer (Tailwind gray-600). */
  textSecondary: '#6B7280',
  /** Texto auxiliar: labels chicas, hints (Tailwind gray-500). */
  textTertiary: '#9CA3AF',

  /** Fondo de filas alternadas en la tabla (Tailwind gray-50). */
  rowAlternate: '#F9FAFB',
  /** Borde de tabla y separadores (Tailwind gray-200). */
  border: '#E5E7EB',
} as const;

export type PdfPaletteToken = keyof typeof PDF_PALETTE;
