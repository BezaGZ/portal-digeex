import { describe, expect, it } from 'vitest';

import { buildFooterIdentifier } from './pdf-header';

/**
 * Tests de `pdf-header`.
 *
 * Infraestructura compartida de los PDFs institucionales. Cubre el armado
 * de la línea identificadora del footer: el handle (identificador
 * archivístico estándar de DSpace) y el uuid (accionable en las URLs del
 * portal) se combinan para que el reporte impreso localice el recurso sin
 * ambigüedad.
 *
 * Ciclo 29 TDD — Sprint 8.
 */
describe('pdf-header', () => {
  /** Verifica que handle y uuid se combinen en una sola línea separada por punto medio. */
  it('should combine handle and uuid into a single footer line', () => {
    expect(buildFooterIdentifier({ handle: '123456789/269', uuid: 'abc-123' })).toBe(
      'Handle: 123456789/269 · UUID: abc-123',
    );
  });

  /** Verifica que con solo handle la línea omita la parte de UUID. */
  it('should return only the handle part when uuid is missing', () => {
    expect(buildFooterIdentifier({ handle: '123456789/269' })).toBe('Handle: 123456789/269');
  });

  /** Verifica que con solo uuid la línea omita la parte de Handle. */
  it('should return only the uuid part when handle is missing', () => {
    expect(buildFooterIdentifier({ uuid: 'abc-123' })).toBe('UUID: abc-123');
  });

  /** Verifica que sin identificadores se devuelva null para que el footer no pinte nada. */
  it('should return null when neither handle nor uuid is provided', () => {
    expect(buildFooterIdentifier({})).toBeNull();
  });
});
