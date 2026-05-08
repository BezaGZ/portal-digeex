import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';

import { StatsSubmissionForm } from './stats-submission-form';
import { Collection } from '../../../../../core/api/models/collection.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { getSubmissionFormComponent } from '../../submission-form-registry';

/**
 * Test para submission form de Estadística.
 * 
 * El formulario de Estadística extiende BaseSubmissionForm con un set
 * mínimo de campos: título, resumen y fecha de publicación. El bitstream
 * es un Excel por item; el componente lector que renderiza las gráficas
 * en la vista pública lee `dc.title` como label de cada estadística, por
 * eso ese título también es la etiqueta de la gráfica.
 *
 * Ciclo 25 TDD — Sprint 6
 */
describe('StatsSubmissionForm', () => {
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
      imports: [StatsSubmissionForm],
      providers: [
        provideNoopAnimations(),
        { provide: SubmissionFacade, useValue: { submitItem$: vi.fn() } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  it('should declare digeex-estadistica as the submission section name', () => {
    const fixture = TestBed.createComponent(StatsSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.getSectionName()).toBe('digeex-estadistica');
  });

  it('should default visibility to public and reflect changes from the signal', () => {
    const fixture = TestBed.createComponent(StatsSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getVisibility()).toBe('public');

    c.visibility.set('private');
    expect(c.getVisibility()).toBe('private');
  });

  it('should expose the Excel bitstream via getFiles from the signal', () => {
    const fixture = TestBed.createComponent(StatsSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getFiles()).toEqual([]);

    const xlsx = new File([''], 'datos.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    c.files.set([xlsx]);
    expect(c.getFiles()).toEqual([xlsx]);
  });

  it('should map title, abstract and date to their dc.* keys in buildMetadata', () => {
    const fixture = TestBed.createComponent(StatsSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.setValue({
      title: 'Matrícula 2026',
      abstract: 'Distribución por subdirección',
      issued: '2026-04-30',
    });

    const metadata = c.buildMetadata();

    expect(metadata['dc.title']?.[0]?.value).toBe('Matrícula 2026');
    expect(metadata['dc.description.abstract']?.[0]?.value).toBe(
      'Distribución por subdirección',
    );
    expect(metadata['dc.date.issued']?.[0]?.value).toBe('2026-04-30');
  });

  it('should register itself in the submission form registry under the Estadistica entity-type', () => {
    expect(getSubmissionFormComponent('Estadistica')).toBe(StatsSubmissionForm);
  });
});
