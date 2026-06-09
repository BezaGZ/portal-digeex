import { INSTITUTIONAL_COLORS } from '../../../core/theme/institutional-colors';

/**
 * Paleta del PDF de historial. Los tokens institucionales (`primary`,
 * `primaryAccent`, `white`) leen de `INSTITUTIONAL_COLORS` para no duplicar
 * la fuente de identidad. Los grises del cuerpo del reporte son la escala
 * Tailwind gray-* materializada como hex porque el PDF no tiene Tailwind
 * runtime (función pura sin DOM).
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
