import { describe, expect, it } from 'vitest';

import { TimelineEntry } from '../../../core/provenance/timeline-entry.model';
import { slugifyForFilename } from '../pdf/pdf-filename';
import { HistoryPdfInput, buildHistoryPdf } from './history-pdf-builder';

/**
 * Tests de `history-pdf-builder`.
 *
 * Builder puro del PDF de historial de actividad. Se ejecuta sin Angular y
 * sin DOM: recibe data, devuelve un Blob. Estos tests validan que el blob
 * tenga el shape esperado (mime, header del PDF) y que `slugifyForFilename`
 * produzca slugs seguros para filesystem.
 *
 * Ciclo 28 TDD — Sprint 8. Ajustado en Ciclo 29 (Sprint 8).
 */
describe('history-pdf-builder', () => {
  function buildInput(overrides: Partial<HistoryPdfInput> = {}): HistoryPdfInput {
    const entries: TimelineEntry[] = [
      {
        timestamp: new Date('2026-06-12T14:32:00Z'),
        actor: 'admin@digeex.gob.gt',
        action: 'Edited',
        raw: 'Edited by admin@digeex.gob.gt on 2026-06-12',
      },
      {
        timestamp: new Date('2026-05-01T10:00:00Z'),
        actor: 'super@digeex.gob.gt',
        action: 'Created',
        raw: 'Created by super@digeex.gob.gt on 2026-05-01',
      },
    ];
    return {
      dsoTitle: 'PEAC — Programa de Educación Acelerada',
      dsoSubtitle: 'PEAC',
      dsoType: 'programa',
      entries,
      handle: '123/456',
      generatedAt: new Date('2026-06-12T15:00:00Z'),
      ...overrides,
    };
  }

  /** El blob devuelto es de tipo application/pdf con contenido no vacío. */
  it('should return a non-empty Blob with PDF mime type', () => {
    const blob = buildHistoryPdf(buildInput());
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });

  /** El builder no muta el array de entries que recibe (input read-only). */
  it('should not mutate the input entries array', () => {
    const entries: TimelineEntry[] = [
      { timestamp: new Date('2026-01-01'), actor: 'a', action: 'Created', raw: 'a' },
      { timestamp: new Date('2026-06-01'), actor: 'b', action: 'Edited', raw: 'b' },
    ];
    const snapshot = entries.map((e) => e.raw);
    buildHistoryPdf(buildInput({ entries }));
    expect(entries.map((e) => e.raw)).toEqual(snapshot);
  });

  /** Acepta entries sin timestamp/actor (entries no parseables del provenance crudo). */
  it('should accept entries with null timestamp and null actor without throwing', () => {
    const entries: TimelineEntry[] = [
      { timestamp: null, actor: null, action: 'Unknown', raw: 'patrón no reconocido' },
    ];
    expect(() => buildHistoryPdf(buildInput({ entries }))).not.toThrow();
  });

  /** Acepta los 3 dsoType del union ('item' | 'programa' | 'subdireccion'). */
  it('should accept all three dso types', () => {
    expect(() => buildHistoryPdf(buildInput({ dsoType: 'item' }))).not.toThrow();
    expect(() => buildHistoryPdf(buildInput({ dsoType: 'programa' }))).not.toThrow();
    expect(() => buildHistoryPdf(buildInput({ dsoType: 'subdireccion' }))).not.toThrow();
  });

  /** Tolera lista vacía de entries (genera un PDF con tabla sin filas). */
  it('should produce a PDF even when entries is empty', async () => {
    const blob = buildHistoryPdf(buildInput({ entries: [] }));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });

  /**
   * El raw del provenance trae timestamps ISO UTC (terminados en Z) que el
   * builder reformatea a la zona horaria Guatemala. Validamos que la salida
   * del builder no falle con un raw conteniendo varios timestamps.
   */
  it('should not throw when entries contain ISO UTC timestamps in the raw field', () => {
    const entries: TimelineEntry[] = [
      {
        timestamp: new Date('2026-06-08T22:44:01.855Z'),
        actor: 'admin@mineduc.gob.gt',
        action: 'Edited',
        raw: 'Edited by Administrador DIGEEX (admin@mineduc.gob.gt) on 2026-06-08T22:44:01.855Z',
      },
    ];
    expect(() => buildHistoryPdf(buildInput({ entries }))).not.toThrow();
  });

  /**
   * Cualquier entry cuyo raw no encaje con el patrón `"{Action} by X on Y"`
   * de DSpace debe pasar sin transformar (provenance custom no se rompe).
   * El test valida que el builder no lance ante un raw heterogéneo.
   */
  it('should tolerate non-standard provenance raw shapes', () => {
    const entries: TimelineEntry[] = [
      {
        timestamp: new Date('2026-01-01'),
        actor: null,
        action: 'CustomAction',
        raw: 'Texto libre del provenance sin patrón conocido',
      },
    ];
    expect(() => buildHistoryPdf(buildInput({ entries }))).not.toThrow();
  });
});

describe('slugifyForFilename', () => {
  /** Quita acentos y espacios; resultado seguro para nombre de archivo. */
  it('should strip accents and replace spaces with dashes', () => {
    expect(slugifyForFilename('PEAC — Programa de Educación Acelerada')).toBe(
      'peac-programa-de-educacion-acelerada',
    );
  });

  /** Recorta a 64 caracteres para no exceder límites del filesystem. */
  it('should truncate the slug at 64 characters', () => {
    const longTitle = 'a'.repeat(200);
    expect(slugifyForFilename(longTitle).length).toBeLessThanOrEqual(64);
  });

  /** Sin caracteres válidos, devuelve string vacío (el caller cae a un default). */
  it('should return an empty string when the input has no alphanumerics', () => {
    expect(slugifyForFilename('@@@ !!! ...')).toBe('');
  });
});
