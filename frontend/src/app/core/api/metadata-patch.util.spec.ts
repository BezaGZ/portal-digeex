import { MetadataValue } from './models/metadata.model';
import { buildMetadataPatch } from './metadata-patch.util';

function value(v: string, place = 0): MetadataValue {
  return { value: v, language: null, authority: null, confidence: -1, place };
}

/**
 * Tests del helper puro `buildMetadataPatch`.
 *
 * Diff de metadata para los PATCH de items, collections y communities:
 * replace sobre el primer valor existente, add solo para campos ausentes,
 * remove para campos vaciados y limpieza de posiciones duplicadas. El add
 * de DSpace 9.2 anexa sobre campos existentes (el backend documenta
 * "appending if index is 0 or left out"), por eso el helper nunca lo usa
 * sobre un campo con valores.
 *
 * Ciclo 38 TDD — Sprint 8.
 */
describe('buildMetadataPatch', () => {
  /** Verifica el add con array cuando el campo no existe (única forma de inicializarlo). */
  it('should add the field as an array when it does not exist', () => {
    const ops = buildMetadataPatch({ 'dc.description': 'Nueva' }, {});

    expect(ops).toEqual([
      { op: 'add', path: '/metadata/dc.description', value: [{ value: 'Nueva' }] },
    ]);
  });

  /** Verifica el replace /0/value sobre campos existentes, nunca add (DSpace anexaría). */
  it('should replace the first value when the field exists with a different value', () => {
    const ops = buildMetadataPatch(
      { 'dc.description': 'Editada' },
      { 'dc.description': [value('Original')] },
    );

    expect(ops).toEqual([
      { op: 'replace', path: '/metadata/dc.description/0/value', value: 'Editada' },
    ]);
  });

  /** Verifica el remove del campo completo cuando el valor nuevo queda vacío. */
  it('should remove the whole field when the new value is empty', () => {
    const ops = buildMetadataPatch(
      { 'dc.description': '' },
      { 'dc.description': [value('Original')] },
    );

    expect(ops).toEqual([{ op: 'remove', path: '/metadata/dc.description' }]);
  });

  /** Verifica el diff mínimo: valor único sin cambios no emite operaciones. */
  it('should emit no ops when the single value is unchanged', () => {
    const ops = buildMetadataPatch(
      { 'dc.description': 'Igual' },
      { 'dc.description': [value('Igual')] },
    );

    expect(ops).toEqual([]);
  });

  /**
   * Verifica la limpieza de duplicados históricos: removes descendentes para
   * no invalidar índices, luego el replace del primer valor.
   */
  it('should remove duplicate positions in descending order before replacing the first value', () => {
    const ops = buildMetadataPatch(
      { 'dc.description': 'Editada' },
      { 'dc.description': [value('Dup'), value('Dup', 1), value('Dup', 2)] },
    );

    expect(ops).toEqual([
      { op: 'remove', path: '/metadata/dc.description/2' },
      { op: 'remove', path: '/metadata/dc.description/1' },
      { op: 'replace', path: '/metadata/dc.description/0/value', value: 'Editada' },
    ]);
  });

  /**
   * Verifica que un valor numérico se normalice a string sin reventar.
   * Los inputs numéricos de los forms (orden de programas) entregan number.
   */
  it('should normalize numeric values to strings', () => {
    const ops = buildMetadataPatch(
      { 'dc.identifier.other': 7 },
      { 'dc.identifier.other': [value('2')] },
    );

    expect(ops).toEqual([
      { op: 'replace', path: '/metadata/dc.identifier.other/0/value', value: '7' },
    ]);
  });

  /** Verifica que la limpieza corra aunque el primer valor no cambie (auto-reparación al guardar). */
  it('should clean duplicates even when the first value is unchanged', () => {
    const ops = buildMetadataPatch(
      { 'dc.description': 'Dup' },
      { 'dc.description': [value('Dup'), value('Dup', 1), value('Dup', 2), value('Dup', 3)] },
    );

    expect(ops).toEqual([
      { op: 'remove', path: '/metadata/dc.description/3' },
      { op: 'remove', path: '/metadata/dc.description/2' },
      { op: 'remove', path: '/metadata/dc.description/1' },
    ]);
  });
});
