import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';

import { GallerySubmissionForm } from './gallery-submission-form';
import { Collection } from '../../../../../core/api/models/collection.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { getSubmissionFormComponent } from '../../submission-form-registry';

/**
 * Test para GallerySubmissionForm.
 * 
 * El formulario de Galería extiende BaseSubmissionForm con los campos del
 * schema digeex-galeria. A diferencia de Documento no tiene toggle de
 * variantes (Video) — es un solo flujo: metadata + multi-bitstream para
 * subir las fotos del álbum. Usa los vocabularios programas-digeex,
 * tipo-poblacion, enfoque-imagen y tipos-evento.
 *
 * Ciclo 24 TDD — Sprint 6
 */
describe('GallerySubmissionForm', () => {
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
      imports: [GallerySubmissionForm],
      providers: [
        provideNoopAnimations(),
        { provide: SubmissionFacade, useValue: { submitItem$: vi.fn() } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  it('should declare digeex-galeria as the submission section name', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.getSectionName()).toBe('digeex-galeria');
  });

  it('should default visibility to public and reflect changes from the signal', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getVisibility()).toBe('public');

    c.visibility.set('private');
    expect(c.getVisibility()).toBe('private');
  });

  it('should expose multiple files via getFiles for the photo album', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getFiles()).toEqual([]);

    const a = new File([''], 'foto1.jpg', { type: 'image/jpeg' });
    const b = new File([''], 'foto2.jpg', { type: 'image/jpeg' });
    c.files.set([a, b]);
    expect(c.getFiles()).toEqual([a, b]);
  });

  it('should map every form field to its dc.* / digeex.* key in buildMetadata', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.setValue({
      title: 'Graduación PEAC 2026',
      abstract: 'Ceremonia de cierre',
      type: 'Graduaciones',
      issued: '2026-04-20',
      author: 'Equipo PEAC',
      classification: 'PEAC',
      populationType: 'Mujeres jóvenes',
      imageFocus: 'Infraestructura',
    });

    const metadata = c.buildMetadata();

    expect(metadata['dc.title']?.[0]?.value).toBe('Graduación PEAC 2026');
    expect(metadata['dc.description.abstract']?.[0]?.value).toBe('Ceremonia de cierre');
    expect(metadata['dc.type']?.[0]?.value).toBe('Graduaciones');
    expect(metadata['dc.date.issued']?.[0]?.value).toBe('2026-04-20');
    expect(metadata['dc.contributor.author']?.[0]?.value).toBe('Equipo PEAC');
    expect(metadata['dc.subject.classification']?.[0]?.value).toBe('PEAC');
    expect(metadata['digeex.populationType']?.[0]?.value).toBe('Mujeres jóvenes');
    expect(metadata['digeex.imageFocus']?.[0]?.value).toBe('Infraestructura');
  });

  it('should register itself in the submission form registry under the Galeria entity-type', () => {
    expect(getSubmissionFormComponent('Galeria')).toBe(GallerySubmissionForm);
  });
});
