import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';

import { BaseSubmissionForm } from '../../base-submission-form';
import { registerSubmissionForm } from '../../submission-form-registry';
import { mv } from '../../metadata-value.util';
import { buildMetadataPatch } from '../../metadata-patch.util';
import { toLocalIsoDate } from '../../../../../core/i18n/iso-date.util';
import { MetadataValue } from '../../../../../core/api/models/metadata.model';
import { Item } from '../../../../../core/api/models/item.model';
import { JsonPatchEntry } from '../../../../../core/api/json-patch.util';

/**
 * Formulario de submission para colecciones de tipo Estadística. El item
 * archiva un único bitstream Excel; `dc.title` es la etiqueta de la gráfica
 * que el lector del frontend renderiza después.
 */
@Component({
  selector: 'app-stats-submission-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class StatsSubmissionForm extends BaseSubmissionForm {
  private readonly fb = inject(FormBuilder);

  readonly visibility = signal<'public' | 'private'>('public');

  /** Bitstream Excel: un único archivo por item. */
  readonly files = signal<File[]>([]);

  /** Form mínimo del schema digeex-estadistica: el título es la etiqueta de la gráfica. */
  readonly form = this.fb.nonNullable.group({
    title: '',
    abstract: '',
    issued: '',
  });

  override getSectionName(): string {
    return 'digeex-estadistica';
  }

  override buildMetadata(): Record<string, MetadataValue[]> {
    const v = this.form.getRawValue();
    return {
      'dc.title': [mv(v.title)],
      'dc.description.abstract': [mv(v.abstract)],
      'dc.date.issued': [mv(toLocalIsoDate(v.issued))],
    };
  }

  override getFiles(): File[] {
    return this.files();
  }

  override getVisibility(): 'public' | 'private' {
    return this.visibility();
  }

  /** Pre-llena el form desde la metadata del item; F-05 todavía no expone UI completa. */
  override applyItemToForm(item: Item): void {
    const m = item.metadata;
    const first = (k: string): string => m?.[k]?.[0]?.value ?? '';
    this.form.patchValue({
      title: first('dc.title'),
      abstract: first('dc.description.abstract'),
      issued: first('dc.date.issued'),
    });
    this.visibility.set(item.discoverable ? 'public' : 'private');
  }

  /** Diff form vs metadata original del item. */
  override buildPatchFromForm(item: Item): JsonPatchEntry[] {
    const v = this.form.getRawValue();
    return buildMetadataPatch(
      {
        'dc.title': v.title,
        'dc.description.abstract': v.abstract,
        'dc.date.issued': toLocalIsoDate(v.issued),
      },
      item.metadata ?? {},
    );
  }
}

registerSubmissionForm('Estadistica', StatsSubmissionForm);
