import { parseIsoDateLocal, toLocalIsoDate } from './iso-date.util';

/**
 * Tests de `iso-date.util`.
 *
 * Helpers para mover fechas entre el string ISO date-only que persiste
 * DSpace (`dc.date.issued`) y el `Date` de JS conservando los
 * componentes locales.
 */
describe('toLocalIsoDate', () => {
  /** Verifica que un string ISO date-only se devuelva sin tocar. */
  it('returns the string unchanged when input is already YYYY-MM-DD', () => {
    expect(toLocalIsoDate('2026-04-27')).toBe('2026-04-27');
  });

  /** Verifica que un Date se formatee con componentes locales. */
  it('formats a Date using local components without UTC shift', () => {
    expect(toLocalIsoDate(new Date(2026, 3, 27))).toBe('2026-04-27');
  });

  /** Verifica que entradas nulas devuelvan string vacío. */
  it('returns empty string for null or undefined', () => {
    expect(toLocalIsoDate(null)).toBe('');
    expect(toLocalIsoDate(undefined)).toBe('');
  });
});

describe('parseIsoDateLocal', () => {
  /** Verifica que el string YYYY-MM-DD se parsee como fecha local. */
  it('parses a YYYY-MM-DD string as local date', () => {
    const d = parseIsoDateLocal('2026-04-27');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3);
    expect(d!.getDate()).toBe(27);
  });

  /** Verifica que entradas inválidas devuelvan null. */
  it('returns null for empty or invalid input', () => {
    expect(parseIsoDateLocal(null)).toBeNull();
    expect(parseIsoDateLocal('')).toBeNull();
    expect(parseIsoDateLocal('not-a-date')).toBeNull();
  });
});
