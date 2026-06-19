import { registerLocaleData } from '@angular/common';
import localeEsGT from '@angular/common/locales/es-GT';

import { formatStatNumber } from './number.util';

/**
 * Tests de `formatStatNumber`.
 *
 * Formato de conteo entero (sin decimales) con el locale recibido. Fuente
 * única del formato numérico para los callbacks de Chart.js, que no pueden
 * usar el pipe `number` del template.
 *
 * Ciclo 24 TDD — Sprint 9.
 */
describe('formatStatNumber', () => {
  beforeAll(() => registerLocaleData(localeEsGT));

  /** Sin decimales: redondea al entero (patrón 1.0-0). */
  it('should round to an integer with no decimals', () => {
    expect(formatStatNumber(12.7, 'es-GT')).toBe('13');
  });

  /** Aplica el separador de miles del locale (sin asumir cuál es). */
  it('should apply the locale thousands separator', () => {
    expect(formatStatNumber(1000, 'es-GT')).toMatch(/^1[.,]000$/);
  });
});
