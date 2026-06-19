import { formatNumber } from '@angular/common';

/**
 * Formatea un conteo entero con el locale recibido y sin decimales (patrón
 * `1.0-0`). Fuente única del formato numérico para los callbacks de Chart.js,
 * que corren en JS puro y no pueden usar el pipe `number` del template. El
 * locale llega del `LOCALE_ID` inyectado, no hardcodeado.
 */
export function formatStatNumber(value: number, locale: string): string {
  return formatNumber(value, locale, '1.0-0');
}
