/**
 * Parsea un string ISO date (`YYYY-MM-DD`) como fecha LOCAL. La spec de
 * ECMAScript interpreta strings date-only como UTC midnight, lo que en GT
 * (UTC-6) muestra el día anterior al renderizar con toLocaleDateString
 * o DatePipe; este parser preserva el día tal cual lo guardó DSpace.
 *
 * Útil para mostrar `dc.date.issued` en listados y vistas de detalle sin
 * desfase de zona horaria. No reemplaza el LOCALE_ID global de Angular,
 * lo complementa.
 */
export function parseIsoDateLocal(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Normaliza un valor de fecha a string `YYYY-MM-DD` usando componentes
 * locales. Si la entrada ya es string lo devuelve sin tocar; si es Date,
 * lo formatea sin pasar por UTC. Pensado para serializar a `dc.date.issued`
 * desde un FormControl que puede emitir `Date` o `string`.
 */
export function toLocalIsoDate(value: Date | string | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
