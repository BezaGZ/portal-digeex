import { TestBed } from '@angular/core/testing';

import { ProvenanceService } from './provenance.service';
import { MetadataMap, MetadataValue } from '../api/models/metadata.model';

/**
 * Tests de `ProvenanceService`.
 *
 * Parser puro del array `dc.description.provenance` que DSpace mantiene en
 * los recursos item, community y collection. Cubre los cuatro patrones
 * nativos (Submitted by, Made available in DSpace on, Withdrawn from,
 * Reinstated by) más el patrón del portal (Edited by NAME (EMAIL) on
 * TIMESTAMP). Entradas no reconocidas se exponen con `raw` para que el
 * timeline las renderice como texto plano sin perder información.
 *
 * Ciclo 13 TDD — Sprint 8. Ajustado en Ciclo 15 (Sprint 8).
 */
describe('ProvenanceService', () => {
  let service: ProvenanceService;

  function buildMetadataValue(value: string): MetadataValue {
    return { value, language: null, authority: null, confidence: -1, place: 0 };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ProvenanceService] });
    service = TestBed.inject(ProvenanceService);
  });

  /** Verifica el patrón nativo "Submitted by NAME (EMAIL) on TIMESTAMP". */
  it('should parse the native "Submitted by" pattern', () => {
    const entries = [
      buildMetadataValue(
        'Submitted by Jane Doe (jdoe@example.com) on 2024-01-15T10:30:00Z',
      ),
    ];

    const [entry] = service.parseProvenance(entries);

    expect(entry.action).toBe('Submitted');
    expect(entry.actor).toBe('Jane Doe (jdoe@example.com)');
    expect(entry.timestamp?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  /** Verifica el patrón nativo "Made available in DSpace on TIMESTAMP" (sin actor). */
  it('should parse the native "Made available in DSpace on" pattern', () => {
    const entries = [
      buildMetadataValue('Made available in DSpace on 2024-01-15T10:35:00Z (GMT). No. of bitstreams: 1'),
    ];

    const [entry] = service.parseProvenance(entries);

    expect(entry.action).toBe('Made available');
    expect(entry.actor).toBeNull();
    expect(entry.timestamp?.toISOString()).toBe('2024-01-15T10:35:00.000Z');
  });

  /** Verifica el patrón nativo "Withdrawn from DSpace on TIMESTAMP by NAME". */
  it('should parse the native "Withdrawn from DSpace" pattern', () => {
    const entries = [
      buildMetadataValue(
        'Withdrawn from DSpace on 2024-02-01T14:00:00Z by Admin User (admin@example.com)',
      ),
    ];

    const [entry] = service.parseProvenance(entries);

    expect(entry.action).toBe('Withdrawn');
    expect(entry.actor).toBe('Admin User (admin@example.com)');
    expect(entry.timestamp?.toISOString()).toBe('2024-02-01T14:00:00.000Z');
  });

  /** Verifica el patrón nativo "Reinstated by NAME (EMAIL) on TIMESTAMP". */
  it('should parse the native "Reinstated by" pattern', () => {
    const entries = [
      buildMetadataValue(
        'Reinstated by John Smith (jsmith@example.com) on 2024-02-05T09:00:00Z',
      ),
    ];

    const [entry] = service.parseProvenance(entries);

    expect(entry.action).toBe('Reinstated');
    expect(entry.actor).toBe('John Smith (jsmith@example.com)');
    expect(entry.timestamp?.toISOString()).toBe('2024-02-05T09:00:00.000Z');
  });

  /** Verifica el patrón del portal "Edited by NAME (EMAIL) on TIMESTAMP". */
  it('should parse the DIGEEX "Edited by" pattern', () => {
    const entries = [
      buildMetadataValue(
        'Edited by Mynor Bezaleel (mynor@mineduc.gob.gt) on 2026-06-03T15:00:00Z',
      ),
    ];

    const [entry] = service.parseProvenance(entries);

    expect(entry.action).toBe('Edited');
    expect(entry.actor).toBe('Mynor Bezaleel (mynor@mineduc.gob.gt)');
    expect(entry.timestamp?.toISOString()).toBe('2026-06-03T15:00:00.000Z');
  });

  /**
   * Verifica que una entrada que no matchea ningún patrón conocido se preserve
   * con `raw` y campos parseados en `null`/`'Unknown'` para que el timeline
   * la renderice como texto plano sin romper.
   */
  it('should preserve unrecognized entries with their raw text', () => {
    const raw = 'Some custom non-standard provenance note';
    const entries = [buildMetadataValue(raw)];

    const [entry] = service.parseProvenance(entries);

    expect(entry.raw).toBe(raw);
    expect(entry.action).toBe('Unknown');
    expect(entry.actor).toBeNull();
    expect(entry.timestamp).toBeNull();
  });

  /**
   * Verifica el orden cronológico descendente (más reciente primero) cuando
   * las entradas vienen mezcladas. La timeline visual lee el array en orden.
   */
  it('should sort parsed entries chronologically descending', () => {
    const entries = [
      buildMetadataValue('Submitted by Jane Doe (jdoe@example.com) on 2024-01-15T10:30:00Z'),
      buildMetadataValue('Reinstated by John Smith (jsmith@example.com) on 2024-02-05T09:00:00Z'),
      buildMetadataValue('Made available in DSpace on 2024-01-20T10:35:00Z'),
    ];

    const result = service.parseProvenance(entries);

    expect(result.map((e) => e.action)).toEqual(['Reinstated', 'Made available', 'Submitted']);
  });

  /**
   * Verifica que `extractFrom` lea el array `dc.description.provenance` del metadata
   * y devuelva `[]` cuando la key no existe (catálogos cargados por SAF).
   */
  it('should extract the dc.description.provenance entries from a MetadataMap, returning [] when the key is absent', () => {
    const metadata: MetadataMap = {
      'dc.title': [buildMetadataValue('Título de prueba')],
      'dc.description.provenance': [
        buildMetadataValue('Submitted by Jane Doe (jdoe@example.com) on 2024-01-15T10:30:00Z'),
        buildMetadataValue('Made available in DSpace on 2024-01-20T10:35:00Z'),
      ],
    };

    const result = service.extractFrom(metadata);
    expect(result.map((e) => e.action)).toEqual(['Made available', 'Submitted']);

    const empty = service.extractFrom({ 'dc.title': [buildMetadataValue('Solo título')] });
    expect(empty).toEqual([]);
  });
});
