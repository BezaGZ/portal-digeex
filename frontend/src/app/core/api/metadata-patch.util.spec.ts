import { MetadataValue } from './models/metadata.model';
import { buildMetadataPatch, buildRepeatableMetadataPatch } from './metadata-patch.util';

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

/**
 * Tests del helper puro `buildRepeatableMetadataPatch` para campos repetibles
 * (dc.subject y similares).
 *
 * DSpace 9.2 acepta con 200 pero no persiste un `remove` del campo entero
 * seguido de un `add` con array, así que el diff se hace por índice siguiendo el
 * REST Contract; un campo ausente se inicializa con `add` de array.
 *
 * Ciclo 42 TDD — Sprint 10.
 */
describe('buildRepeatableMetadataPatch', () => {
  /** Verifica que un campo ausente se inicialice con un add de array (única forma válida). */
  it('should add the field as an array when it does not exist', () => {
    const ops = buildRepeatableMetadataPatch('dc.subject', ['Requisitos', 'Nuevos'], {});

    expect(ops).toEqual([
      {
        op: 'add',
        path: '/metadata/dc.subject',
        value: [{ value: 'Requisitos' }, { value: 'Nuevos' }],
      },
    ]);
  });

  /** Verifica que un valor nuevo se anexe con el índice `/-` como objeto único, no array. */
  it('should append a new value with the /- index when the field already exists', () => {
    const ops = buildRepeatableMetadataPatch(
      'dc.subject',
      ['Requisitos', 'Nuevos'],
      { 'dc.subject': [value('Requisitos')] },
    );

    expect(ops).toEqual([{ op: 'add', path: '/metadata/dc.subject/-', value: { value: 'Nuevos' } }]);
  });

  /** Verifica que un valor cambiado se reemplace en su posición con replace /i/value. */
  it('should replace a changed value in place', () => {
    const ops = buildRepeatableMetadataPatch(
      'dc.subject',
      ['Requisito', 'Nuevos'],
      { 'dc.subject': [value('Requisitos'), value('Nuevos', 1)] },
    );

    expect(ops).toEqual([
      { op: 'replace', path: '/metadata/dc.subject/0/value', value: 'Requisito' },
    ]);
  });

  /** Verifica que los valores sobrantes se quiten por índice descendente. */
  it('should remove surplus values by descending index', () => {
    const ops = buildRepeatableMetadataPatch(
      'dc.subject',
      ['Requisitos'],
      { 'dc.subject': [value('Requisitos'), value('Nuevos', 1), value('Extra', 2)] },
    );

    expect(ops).toEqual([
      { op: 'remove', path: '/metadata/dc.subject/2' },
      { op: 'remove', path: '/metadata/dc.subject/1' },
    ]);
  });

  /** Verifica que vaciar la lista borre el campo completo con un remove suelto. */
  it('should remove the whole field when the new list is empty', () => {
    const ops = buildRepeatableMetadataPatch(
      'dc.subject',
      [],
      { 'dc.subject': [value('Requisitos'), value('Nuevos', 1)] },
    );

    expect(ops).toEqual([{ op: 'remove', path: '/metadata/dc.subject' }]);
  });

  /** Verifica que no se emita ninguna op cuando la lista y el campo están vacíos. */
  it('should emit no ops when both the new list and the field are empty', () => {
    const ops = buildRepeatableMetadataPatch('dc.subject', [], {});

    expect(ops).toEqual([]);
  });

  /** Verifica que no se emita ninguna op cuando la lista no cambió. */
  it('should emit no ops when the list is unchanged', () => {
    const ops = buildRepeatableMetadataPatch(
      'dc.subject',
      ['Requisitos', 'Nuevos'],
      { 'dc.subject': [value('Requisitos'), value('Nuevos', 1)] },
    );

    expect(ops).toEqual([]);
  });

  /** Verifica que un valor cambiado se reemplace y uno nuevo se anexe, en ese orden. */
  it('should replace a changed value and append a new one together', () => {
    const ops = buildRepeatableMetadataPatch(
      'dc.subject',
      ['Requisito', 'Nuevos'],
      { 'dc.subject': [value('Requisitos')] },
    );

    expect(ops).toEqual([
      { op: 'replace', path: '/metadata/dc.subject/0/value', value: 'Requisito' },
      { op: 'add', path: '/metadata/dc.subject/-', value: { value: 'Nuevos' } },
    ]);
  });
});
