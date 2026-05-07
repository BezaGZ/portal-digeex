import {
  Component,
  ChangeDetectionStrategy,
  computed,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageModule } from 'primeng/message';

import { Collection } from '../../../core/api/models/collection.model';
import { Caller } from '../content/specifications/scope-context.model';
import { getSubmissionFormComponent } from './submission-form-registry';

/**
 * Lee `dspace.entity.type` de la colección y monta el formulario del
 * registry vía NgComponentOutlet, pasándole `collection` y `caller` como
 * inputs. Si el tipo no está registrado o la colección no expone
 * entity-type, muestra un mensaje de aviso.
 */
@Component({
  selector: 'app-submission-form-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MessageModule],
  templateUrl: './submission-form-host.html',
})
export class SubmissionFormHost {
  readonly collection = input.required<Collection>();
  readonly caller = input.required<Caller>();

  readonly entityType = computed(
    () => this.collection().metadata?.['dspace.entity.type']?.[0]?.value,
  );

  readonly formComponent = computed(() =>
    getSubmissionFormComponent(this.entityType()),
  );

  readonly inputs = computed(() => ({
    collection: this.collection(),
    caller: this.caller(),
  }));
}
