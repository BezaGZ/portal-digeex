import { TestBed } from '@angular/core/testing';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsGT from '@angular/common/locales/es-GT';

import { IsoDateLocalPipe } from './iso-date-local.pipe';

/**
 * Tests de `IsoDateLocalPipe`.
 *
 * Formatea un string ISO date-only respetando el día local. Combina
 * `parseIsoDateLocal` con `formatDate` de Angular usando el `LOCALE_ID`
 * inyectado.
  *
 * Ciclo 36 TDD — Sprint 6. Ajustado en Ciclo 23 (Sprint 9).
 */
describe('IsoDateLocalPipe', () => {
  beforeAll(() => registerLocaleData(localeEsGT));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LOCALE_ID, useValue: 'es-GT' }, IsoDateLocalPipe],
    });
  });

  /** Verifica que un string YYYY-MM-DD se formatee preservando el día local. */
  it('should preserve the local day when formatting a YYYY-MM-DD string', () => {
    const pipe = TestBed.inject(IsoDateLocalPipe);
    expect(pipe.transform('2026-05-04', 'dd/MM/yyyy')).toBe('04/05/2026');
  });

  /**
   * Verifica el formato estándar del proyecto: sin argumento, el pipe usa
   * `dd/MM/yyyy` (año de 4 dígitos). Es la fuente única del formato de fecha;
   * cambiarlo acá lo cambia en todos los usos sin pasar formato.
   */
  it('should default to dd/MM/yyyy (4-digit year) when no format is given', () => {
    const pipe = TestBed.inject(IsoDateLocalPipe);
    expect(pipe.transform('2026-05-04')).toBe('04/05/2026');
  });

  /** Verifica que los alias de formato de Angular sean aceptados. */
  it('should accept Angular format aliases like shortDate', () => {
    const pipe = TestBed.inject(IsoDateLocalPipe);
    const out = pipe.transform('2026-05-04', 'shortDate');
    expect(out).toContain('4');
    expect(out).toContain('5');
    expect(out).toContain('26');
  });

  /** Verifica que entradas nulas devuelvan string vacío. */
  it('should return empty string for null, undefined or empty input', () => {
    const pipe = TestBed.inject(IsoDateLocalPipe);
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  /** Verifica que un Date entre como está y se delegue al formatter. */
  it('should pass Date objects through to the formatter unchanged', () => {
    const pipe = TestBed.inject(IsoDateLocalPipe);
    expect(pipe.transform(new Date(2026, 4, 4), 'dd/MM/yyyy')).toBe('04/05/2026');
  });

  /** Verifica que strings inválidos devuelvan string vacío. */
  it('should return empty string for non-parseable strings', () => {
    const pipe = TestBed.inject(IsoDateLocalPipe);
    expect(pipe.transform('not a date')).toBe('');
  });

  /**
   * Verifica que un valor de solo año (4 dígitos) se devuelva tal cual, sin
   * pasarlo por Date: `new Date('2025')` es UTC y en GT (UTC-6) mostraría el
   * año anterior. Cubre los `dc.date.issued` que guardan solo el año.
   */
  it('should pass a year-only (4-digit) value through unchanged', () => {
    const pipe = TestBed.inject(IsoDateLocalPipe);
    expect(pipe.transform('2025')).toBe('2025');
    expect(pipe.transform('2025', 'dd/MM/yyyy')).toBe('2025');
  });
});
