import { normalizeHeader, resolveHeaders, readCell } from './normalize-headers.util';

/**
 * Tests del helper `normalize-headers.util`.
 *
 * El admin sube Excels con headers que pueden venir en cualquier case y con
 * espacios sobrantes (observado en `Datos Docentes Final.xlsx`: la columna
 * `Contrato  ` tiene dos espacios al final y los valores de `Departamento`
 * vienen con un espacio inicial). Este módulo permite a los renderers
 * declarar keys lógicas normalizadas y resolverlas contra los headers físicos
 * sin acoplarse a la grafía exacta del archivo fuente.
 *
 * Ciclo 8 TDD — Sprint 7.
 */
describe('normalize-headers.util', () => {
  /** Trim + lowercase del header recibido. */
  it('should normalize a header by trimming and lowercasing', () => {
    expect(normalizeHeader('  SEXO  ')).toBe('sexo');
    expect(normalizeHeader('Contrato  ')).toBe('contrato');
    expect(normalizeHeader('Departamento')).toBe('departamento');
  });

  /** null/undefined caen a string vacío para no romper la lookup downstream. */
  it('should return an empty string for null or undefined headers', () => {
    expect(normalizeHeader(null)).toBe('');
    expect(normalizeHeader(undefined)).toBe('');
  });

  /** Resuelve las keys lógicas a los headers físicos del Excel preservando la grafía original. */
  it('should resolve logical keys to physical headers preserving the original spelling', () => {
    const headers = ['Sexo', 'Contrato  ', 'Departamento'];
    const map = resolveHeaders(headers, ['sexo', 'contrato', 'departamento']);

    expect(map).toEqual({
      sexo: 'Sexo',
      contrato: 'Contrato  ',
      departamento: 'Departamento',
    });
  });

  /** Si falta una columna requerida, lanza un Error claro con la lista de faltantes. */
  it('should throw when a required logical key has no matching header', () => {
    expect(() => resolveHeaders(['Sexo'], ['sexo', 'contrato'])).toThrow(/contrato/);
  });

  /** Lee la celda del row y trimea solo si el valor es string. */
  it('should trim string cell values and pass through non-strings unchanged', () => {
    const row = { Departamento: ' QUETZALTENANGO', Total: 1234, Vacio: null };

    expect(readCell(row, 'Departamento')).toBe('QUETZALTENANGO');
    expect(readCell(row, 'Total')).toBe(1234);
    expect(readCell(row, 'Vacio')).toBeNull();
  });
});
