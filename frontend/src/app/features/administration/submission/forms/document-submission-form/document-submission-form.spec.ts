import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';

import { DocumentSubmissionForm } from './document-submission-form';
import { Collection } from '../../../../../core/api/models/collection.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { getSubmissionFormComponent } from '../../submission-form-registry';

/**
 * Tests para DocumentSubmissionForm.
 * 
 * El formulario de Documento extiende BaseSubmissionForm con los campos
 * del schema digeex-documento. Cuando el usuario activa el toggle de
 * video externo, el form persiste dc.type=Video + dc.relation.uri en
 * lugar de un PDF; ese mismo componente cubre F-03 (Documento) y F-06
 * (Video externo) según la decisión de Sprint 6 de no duplicar maquinaria
 * de submission para algo que tiene el mismo entity-type.
 *
 * Ciclo 23 TDD — Sprint 6
 */
describe('DocumentSubmissionForm', () => {
  function buildCollection(uuid: string): Collection {
    return {
      uuid,
      name: 'Col',
      handle: '123/1',
      archivedItemsCount: 0,
      type: 'collection',
      metadata: {},
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentSubmissionForm],
      providers: [
        provideNoopAnimations(),
        { provide: SubmissionFacade, useValue: { submitItem$: vi.fn() } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  it('should declare digeex-documento as the submission section name', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.getSectionName()).toBe('digeex-documento');
  });

  it('should default visibility to public and reflect changes from the signal', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getVisibility()).toBe('public');

    c.visibility.set('private');
    expect(c.getVisibility()).toBe('private');
  });

  it('should expose the files signal via getFiles', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getFiles()).toEqual([]);

    const pdf = new File([''], 'doc.pdf', { type: 'application/pdf' });
    c.files.set([pdf]);
    expect(c.getFiles()).toEqual([pdf]);
  });

  it('should map every form field to its dc.* key in buildMetadata', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.setValue({
      title: 'Manual PEAC',
      abstract: 'Resumen del manual',
      type: 'Manual',
      audience: 'Primaria',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      subject: 'educación, adultos',
      language: 'es',
      relationUri: '',
      isVideo: false,
    });

    const metadata = c.buildMetadata();

    expect(metadata['dc.title']?.[0]?.value).toBe('Manual PEAC');
    expect(metadata['dc.description.abstract']?.[0]?.value).toBe('Resumen del manual');
    expect(metadata['dc.type']?.[0]?.value).toBe('Manual');
    expect(metadata['dc.audience']?.[0]?.value).toBe('Primaria');
    expect(metadata['dc.date.issued']?.[0]?.value).toBe('2026-04-15');
    expect(metadata['dc.contributor.author']?.[0]?.value).toBe('Equipo PEAC');
    expect(metadata['dc.subject']?.[0]?.value).toBe('educación, adultos');
    expect(metadata['dc.language.iso']?.[0]?.value).toBe('es');
    expect(metadata['dc.relation.uri']).toBeUndefined();
  });

  it('should override dc.type to Video and include dc.relation.uri when the isVideo toggle is on', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.setValue({
      title: 'Charla de adultos',
      abstract: 'Resumen del video',
      type: 'Manual',
      audience: '',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      subject: '',
      language: '',
      relationUri: 'https://www.youtube.com/watch?v=abc123',
      isVideo: true,
    });

    const metadata = c.buildMetadata();

    expect(metadata['dc.type']?.[0]?.value).toBe('Video');
    expect(metadata['dc.relation.uri']?.[0]?.value).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
  });

  it('should ignore the files signal and return [] in getFiles when isVideo is on', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const pdf = new File([''], 'doc.pdf', { type: 'application/pdf' });
    c.files.set([pdf]);
    c.form.patchValue({ isVideo: true });

    expect(c.getFiles()).toEqual([]);
  });

  it('should register itself in the submission form registry under the Documento entity-type', () => {
    expect(getSubmissionFormComponent('Documento')).toBe(DocumentSubmissionForm);
  });
});
