/**
 * Recorte temporal de los reportes `TotalVisitsPerMonth` de DSpace. Vive en
 * `core/api` porque entiende el formato de label que manda el backend
 * ("Month YYYY") y es la única fuente del recorte: el chart de la pantalla
 * y el PDF exportado deben mostrar los mismos meses.
 */

/** Meses abreviados en español para los labels del chart y del PDF. */
export const MONTH_SHORT_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;

/**
 * Convierte una etiqueta "Month YYYY" en año e índice de mes (0-11).
 * Devuelve `null` cuando el formato no calza.
 */
export function parseMonthLabel(label: string): { year: number; monthIdx: number } | null {
  const match = label.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const idx = months.indexOf(match[1].toLowerCase());
  const year = Number(match[2]);
  if (idx < 0 || !Number.isFinite(year)) return null;
  return { year, monthIdx: idx };
}

/**
 * Deja solo los registros de los últimos `monthsBack` meses contados desde
 * `referenceDate`. La fecha de referencia llega como parámetro para que el
 * mismo input produzca siempre el mismo recorte.
 */
export function applyMonthlyWindow<T extends { year: number; monthIdx: number }>(
  parsed: readonly T[],
  monthsBack: number | null,
  referenceDate: Date,
): T[] {
  if (!monthsBack || monthsBack <= 0) return [...parsed];
  const currentKey = referenceDate.getFullYear() * 12 + referenceDate.getMonth();
  const cutoff = currentKey - (monthsBack - 1);
  return parsed.filter((p) => p.year * 12 + p.monthIdx >= cutoff);
}
