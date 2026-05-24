import { normalizeDepartamento } from './normalize-departamento.util';

/**
 * Tests del helper `normalize-departamento.util`.
 *
 * Colapsa nombres del Excel (mayúsculas sin tildes, con sufijos sucios) y
 * del TopoJSON (title-case con tildes) al mismo string canónico.
 *
 * Ciclo 15 TDD — Sprint 7.
 */

describe('normalizeDepartamento', () => {
  /** Title-case con tildes y mayúsculas sin tildes colapsan al mismo string. */
  it('should produce the same canonical string for the TopoJSON form and the Excel form', () => {
    expect(normalizeDepartamento('Sacatepéquez')).toBe('SACATEPEQUEZ');
    expect(normalizeDepartamento('SACATEPEQUEZ')).toBe('SACATEPEQUEZ');
    expect(normalizeDepartamento('Quetzaltenango')).toBe('QUETZALTENANGO');
    expect(normalizeDepartamento('QUETZALTENANGO')).toBe('QUETZALTENANGO');
    expect(normalizeDepartamento('Sololá')).toBe('SOLOLA');
    expect(normalizeDepartamento('Petén')).toBe('PETEN');
    expect(normalizeDepartamento('Quiché')).toBe('QUICHE');
  });

  /** Whitespace inicial y final del Excel se eliminan; el medio se conserva. */
  it('should trim leading and trailing whitespace without collapsing internal spaces', () => {
    expect(normalizeDepartamento(' GUATEMALA ')).toBe('GUATEMALA');
    expect(normalizeDepartamento('  Alta Verapaz  ')).toBe('ALTA VERAPAZ');
    expect(normalizeDepartamento('Baja Verapaz')).toBe('BAJA VERAPAZ');
    expect(normalizeDepartamento('San Marcos')).toBe('SAN MARCOS');
  });

  /** Strings vacías o nulas devuelven cadena vacía sin lanzar. */
  it('should return an empty string for empty, null or undefined input without throwing', () => {
    expect(normalizeDepartamento('')).toBe('');
    expect(normalizeDepartamento(null)).toBe('');
    expect(normalizeDepartamento(undefined)).toBe('');
  });

  /**
   * Verifica que recorte el sufijo ", GUATEMALA" del Excel de Docentes.
   * El TopoJSON nunca lo lleva, así que sin strip el matching falla.
   */
  it('should strip the ", GUATEMALA" suffix that appears in the Docentes Excel', () => {
    expect(normalizeDepartamento(' EL PROGRESO, GUATEMALA')).toBe('EL PROGRESO');
    expect(normalizeDepartamento(' GUATEMALA, GUATEMALA')).toBe('GUATEMALA');
    expect(normalizeDepartamento(' SAN MARCOS, GUATEMALA')).toBe('SAN MARCOS');
    expect(normalizeDepartamento(' SANTA ROSA, GUATEMALA')).toBe('SANTA ROSA');
  });

  /**
   * Verifica que mapee "EL PETEN" → "PETEN" vía alias.
   * El Excel lleva artículo pero el TopoJSON usa solo "Petén".
   */
  it('should map the EL PETEN alias to the TopoJSON canonical PETEN', () => {
    expect(normalizeDepartamento(' EL PETEN')).toBe('PETEN');
    expect(normalizeDepartamento('EL PETEN')).toBe('PETEN');
    expect(normalizeDepartamento('EL PROGRESO')).toBe('EL PROGRESO');
  });
});
