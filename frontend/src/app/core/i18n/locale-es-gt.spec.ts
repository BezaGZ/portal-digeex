import { TestBed } from '@angular/core/testing';
import { DatePipe, DecimalPipe, CurrencyPipe, registerLocaleData } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import localeEsGT from '@angular/common/locales/es-GT';

/**
 * Tests para localización es-GT (español guatemalteco).
 *
 * Verifica que los pipes de Angular (DatePipe, DecimalPipe, CurrencyPipe)
 * formateen correctamente usando el locale es-GT según RNF-005.
 *
 * Formato esperado:
 * - Fechas: dd/MM/yyyy (02/03/2026)
 * - Decimales: coma como separador decimal, punto como separador de miles
 * - Moneda: Q (Quetzal guatemalteco)
 *
 * Ciclo 4 TDD - Sprint 3: 6 tests implementados.
 */
describe('Locale es-GT', () => {
  beforeAll(() => {
    registerLocaleData(localeEsGT);
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'es-GT' },
        DatePipe,
        DecimalPipe,
        CurrencyPipe
      ]
    });
  });

  // ─── DatePipe ─────────────────────────────────────────────

  /** Verifica que DatePipe formatee fechas en formato dd/MM/yyyy para es-GT. */
  it('DatePipe should format as dd/MM/yyyy', () => {
    const datePipe = TestBed.inject(DatePipe);
    const date = new Date(2026, 2, 2); // 2 de marzo de 2026 (mes es 0-indexed)

    const formatted = datePipe.transform(date, 'short');

    expect(formatted).toBe('2/03/26, 00:00');
  });

  /** Verifica que DatePipe muestre los nombres de meses en español. */
  it('DatePipe should show months in Spanish', () => {
    const datePipe = TestBed.inject(DatePipe);
    const date = new Date(2026, 2, 15); // 15 de marzo de 2026

    const formatted = datePipe.transform(date, 'MMMM');

    expect(formatted).toBe('marzo');
  });

  // ─── DecimalPipe ──────────────────────────────────────────

  /** Verifica que DecimalPipe use coma como separador decimal. */
  it('DecimalPipe should use comma as decimal separator', () => {
    const decimalPipe = TestBed.inject(DecimalPipe);
    const number = 1234.56;

    const formatted = decimalPipe.transform(number, '1.2-2');

    expect(formatted).toBe('1,234.56');
  });

  /** Verifica que DecimalPipe use punto como separador de miles. */
  it('DecimalPipe should use period as thousands separator', () => {
    const decimalPipe = TestBed.inject(DecimalPipe);
    const number = 1234567.89;

    const formatted = decimalPipe.transform(number, '1.2-2');

    expect(formatted).toBe('1,234,567.89');
  });

  // ─── CurrencyPipe ─────────────────────────────────────────

  /** Verifica que CurrencyPipe muestre el símbolo Q (Quetzal). */
  it('CurrencyPipe should display Q symbol', () => {
    const currencyPipe = TestBed.inject(CurrencyPipe);
    const amount = 100;

    const formatted = currencyPipe.transform(amount, 'GTQ', 'symbol');

    expect(formatted).toContain('Q');
  });

  /** Verifica que CurrencyPipe formatee correctamente montos con símbolo Q. */
  it('CurrencyPipe should format as Q with correct separators', () => {
    const currencyPipe = TestBed.inject(CurrencyPipe);
    const amount = 1234.56;

    const formatted = currencyPipe.transform(amount, 'GTQ', 'symbol', '1.2-2');

    expect(formatted).toContain('Q');
    expect(formatted).toContain('1,234.56');
  });
});
