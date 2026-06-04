import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { TimelineEntry } from '../../../core/services/provenance.model';

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
}
