import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { TimelineEntry } from '../timeline-entry.model';

/**
 * Etiquetas en español para las acciones del provenance que el parser
 * normaliza desde DSpace y desde `AuditTrailService`. El backend persiste
 * las cadenas en inglés (campo `dc.description.provenance` es nativo de
 * DSpace); la UI las traduce al renderizar.
 */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  Submitted: 'Subido',
  'Made available': 'Publicado',
  Created: 'Creado',
  Edited: 'Editado',
  Withdrawn: 'Retirado',
  Reinstated: 'Restaurado',
};

/**
 * Timeline cronológica de actividad del recurso. Componente presentacional puro:
 * recibe `entries: TimelineEntry[]` ya parseado y renderiza la lista con semántica
 * `<ol>` + `<time datetime>` para que tecnologías asistivas la indexen.
 */
@Component({
  selector: 'app-provenance-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule],
  templateUrl: './provenance-timeline.html',
})
export class ProvenanceTimeline {
  readonly entries = input.required<TimelineEntry[]>();

  /** Devuelve la etiqueta localizada de una acción; cae al texto original si no hay traducción. */
  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }
}
