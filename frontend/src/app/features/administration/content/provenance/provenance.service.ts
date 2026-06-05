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

/**
 * Fragmento de timestamp ISO 8601 aceptado por DSpace y por `Date.toISOString()`
 * del frontend. Los milisegundos son opcionales porque DSpace nativo los
 * omite (`...:02Z`) mientras que `AuditTrailService` los incluye (`...:02.201Z`).
 */
const TS = '(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z)';

const PATTERNS: readonly ProvenancePattern[] = [
  { action: 'Submitted', regex: new RegExp(`^Submitted by (.+?) on ${TS}`) },
  { action: 'Made available', regex: new RegExp(`^Made available in DSpace on ${TS}`) },
  { action: 'Withdrawn', regex: new RegExp(`^Item withdrawn by (.+?) on ${TS}`) },
  { action: 'Reinstated', regex: new RegExp(`^Item reinstated by (.+?) on ${TS}`) },
  { action: 'Created', regex: new RegExp(`^Created by (.+?) on ${TS}`) },
  { action: 'Edited', regex: new RegExp(`^Edited by (.+?) on ${TS}`) },
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
   * Intenta cada patrón en orden hasta encontrar match. "Made available" solo
   * captura timestamp; los otros cuatro capturan actor + timestamp en ese orden.
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
