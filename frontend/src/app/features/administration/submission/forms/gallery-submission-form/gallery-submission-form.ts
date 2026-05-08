import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';

import { BaseSubmissionForm } from '../../base-submission-form';
import { registerSubmissionForm } from '../../submission-form-registry';
import { mv } from '../../metadata-value.util';
import { MetadataValue } from '../../../../../core/api/models/metadata.model';

/**
 * Formulario de submission para colecciones de tipo Galería. Persiste un
 * álbum de fotos (multi-bitstream) con metadata de programa, tipo de
 * población y enfoque de imagen.
 */
@Component({
  selector: 'app-gallery-submission-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class GallerySubmissionForm extends BaseSubmissionForm {
  private readonly fb = inject(FormBuilder);

  readonly visibility = signal<'public' | 'private'>('public');

  /** Multi-bitstream: cada foto del álbum llega al bundle ORIGINAL del workspaceitem. */
  readonly files = signal<File[]>([]);

  /** Form de los campos del schema digeex-galeria. */
  readonly form = this.fb.nonNullable.group({
    title: '',
    abstract: '',
    type: '',
    issued: '',
    author: '',
    classification: '',
    populationType: '',
    imageFocus: '',
  });

  override getSectionName(): string {
    return 'digeex-galeria';
  }

  override buildMetadata(): Record<string, MetadataValue[]> {
    const v = this.form.getRawValue();
    return {
      'dc.title': [mv(v.title)],
      'dc.description.abstract': [mv(v.abstract)],
      'dc.type': [mv(v.type)],
      'dc.date.issued': [mv(v.issued)],
      'dc.contributor.author': [mv(v.author)],
      'dc.subject.classification': [mv(v.classification)],
      'digeex.populationType': [mv(v.populationType)],
      'digeex.imageFocus': [mv(v.imageFocus)],
    };
  }

  override getFiles(): File[] {
    return this.files();
  }

  override getVisibility(): 'public' | 'private' {
    return this.visibility();
  }
}

registerSubmissionForm('Galeria', GallerySubmissionForm);
