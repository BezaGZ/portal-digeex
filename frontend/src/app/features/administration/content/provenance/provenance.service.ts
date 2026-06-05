import { Injectable } from '@angular/core';
import { MetadataMap, MetadataValue } from '../../../../core/api/models/metadata.model';
import { TimelineEntry } from './timeline-entry.model';

/**
 * Patrones reconocidos en `dc.description.provenance`. Sumar un patrón
 * nuevo es agregar una entrada al arreglo (OCP). Los cuatro primeros son
 * nativos de DSpace 9.x; el quinto es el que escribe el portal vía AuditTrail.
 */
interface ProvenancePattern {
  readonly action: string;
  readonly regex: RegExp;
}

const PATTERNS: readonly ProvenancePattern[] = [
  {
    action: 'Submitted',
    regex: /^Submitted by (.+?) on (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
  },
  {
    action: 'Made available',
    regex: /^Made available in DSpace on (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
  },
  {
    action: 'Withdrawn',
    regex:
      /^Withdrawn from DSpace on (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) by (.+)$/,
  },
  {
    action: 'Reinstated',
    regex: /^Reinstated by (.+?) on (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
  },
  {
    action: 'Edited',
    regex: /^Edited by (.+?) on (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
  },
];

/**
 * Parser puro del array `dc.description.provenance`. Entradas no reconocidas
 * caen con `action='Unknown'` y `raw` intacto para que el timeline las
 * renderice como texto plano sin perder información.
 */
@Injectable({ providedIn: 'root' })
export class ProvenanceService {
  parseProvenance(entries: MetadataValue[]): TimelineEntry[] {
    const parsed = entries.map((entry) => this.parseEntry(entry.value));
    return parsed.sort((a, b) => this.compareTimestampsDesc(a, b));
  }

  /**
   * Lee el array `dc.description.provenance` de un metadata map y delega a
   * `parseProvenance`. Las 3 pantallas detail del visor lo invocan en una sola
   * línea sin replicar el lookup de la key.
   */
  extractFrom(metadata: MetadataMap): TimelineEntry[] {
    const entries = metadata['dc.description.provenance'] ?? [];
    return this.parseProvenance(entries);
  }

  /**
   * Intenta cada patrón en orden hasta encontrar match. "Withdrawn" pone
   * timestamp antes que actor en las capturas; los demás invierten el orden.
   */
  private parseEntry(raw: string): TimelineEntry {
    for (const pattern of PATTERNS) {
      const match = raw.match(pattern.regex);
      if (!match) continue;

      if (pattern.action === 'Made available') {
        return {
          action: pattern.action,
          actor: null,
          timestamp: this.toDate(match[1]),
          raw,
        };
      }
      if (pattern.action === 'Withdrawn') {
        return {
          action: pattern.action,
          actor: match[2],
          timestamp: this.toDate(match[1]),
          raw,
        };
      }
      return {
        action: pattern.action,
        actor: match[1],
        timestamp: this.toDate(match[2]),
        raw,
      };
    }
    return { action: 'Unknown', actor: null, timestamp: null, raw };
  }

  private toDate(iso: string): Date | null {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** Orden descendente por timestamp; entradas sin timestamp van al final. */
  private compareTimestampsDesc(a: TimelineEntry, b: TimelineEntry): number {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp.getTime() - a.timestamp.getTime();
  }
}
