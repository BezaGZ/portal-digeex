/**
 * Entrada parseada de `dc.description.provenance` lista para render en timeline.
 * `timestamp`/`actor` pueden ser `null` cuando el patrón no los expone; `raw`
 * conserva el texto original para que entradas no reconocidas no pierdan info.
 */
export interface TimelineEntry {
  timestamp: Date | null;
  actor: string | null;
  action: string;
  raw: string;
}
