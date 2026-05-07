import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';

import { BaseSubmissionForm } from '../../base-submission-form';
import { registerSubmissionForm } from '../../submission-form-registry';
import { MetadataValue } from '../../../../../core/api/models/metadata.model';

/** Helper para envolver un string en el shape MetadataValue que DSpace espera. */
function mv(value: string): MetadataValue {
  return { value, language: null, authority: null, confidence: -1, place: 0 };
}

/**
 * Formulario de submission para colecciones de tipo Documento. Extiende
 * la base con los campos del schema digeex-documento y un toggle "video
 * externo" que cuando se activa cambia el comportamiento a guardar URL
 * en lugar de PDF (cubre F-03 y F-06 con un solo componente).
 */
@Component({
  selector: 'app-document-submission-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class DocumentSubmissionForm extends BaseSubmissionForm {
  private readonly fb = inject(FormBuilder);

  /** Lo bindeará un toggle del template; default público para el caso común. */
  readonly visibility = signal<'public' | 'private'>('public');

  /** Bitstreams seleccionados por el `<p-fileUpload>` del template. */
  readonly files = signal<File[]>([]);

  /** Form de los campos del schema digeex-documento. `isVideo` es el toggle. */
  readonly form = this.fb.nonNullable.group({
    title: '',
    abstract: '',
    type: '',
    audience: '',
    issued: '',
    author: '',
    subject: '',
    language: '',
    relationUri: '',
    isVideo: false,
  });

  override getSectionName(): string {
    return 'digeex-documento';
  }

  override buildMetadata(): Record<string, MetadataValue[]> {
    const v = this.form.getRawValue();
    const md: Record<string, MetadataValue[]> = {
      'dc.title': [mv(v.title)],
      'dc.description.abstract': [mv(v.abstract)],
      'dc.type': [mv(v.isVideo ? 'Video' : v.type)],
      'dc.audience': [mv(v.audience)],
      'dc.date.issued': [mv(v.issued)],
      'dc.contributor.author': [mv(v.author)],
      'dc.subject': [mv(v.subject)],
      'dc.language.iso': [mv(v.language)],
    };
    if (v.isVideo) {
      md['dc.relation.uri'] = [mv(v.relationUri)];
    }
    return md;
  }

  override getFiles(): File[] {
    if (this.form.controls.isVideo.value) return [];
    return this.files();
  }

  override getVisibility(): 'public' | 'private' {
    return this.visibility();
  }
}

registerSubmissionForm('Documento', DocumentSubmissionForm);
