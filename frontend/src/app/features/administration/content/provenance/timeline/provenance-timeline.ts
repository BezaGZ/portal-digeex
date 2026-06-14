import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { PROVENANCE_ACTION_LABELS } from '../../../../../core/provenance/action-labels';
import { TimelineEntry } from '../../../../../core/provenance/timeline-entry.model';

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
    return PROVENANCE_ACTION_LABELS[action] ?? action;
  }
}
