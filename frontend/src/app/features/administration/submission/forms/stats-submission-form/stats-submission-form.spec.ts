import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { StatsSubmissionForm } from './stats-submission-form';
import { Collection } from '../../../../../core/api/models/collection.model';
import { Item } from '../../../../../core/api/models/item.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { ItemAdminFacade } from '../../../content/services/item-admin-facade';
import { VocabularyApiService } from '../../../../../core/api/vocabulary-api.service';
import { VocabularyEntry } from '../../../../../core/api/models/vocabulary-entry.model';
import { getSubmissionFormComponent } from '../../submission-form-registry';

/**
 * Tests de `StatsSubmissionForm`.
 *
 * Formulario de submission para colecciones de tipo Estadística. Extiende
 * `BaseSubmissionForm` con cuatro campos del schema digeex-estadistica
 * (`dc.title`, `dc.description.abstract`, `dc.date.issued`, `digeex.statsDataset`)
 * más un dropzone de un único `.xlsx`. El valor de `digeex.statsDataset` lo
 * elige el admin desde un dropdown poblado por el vocabulario controlado
 * `tipos-dataset-estadistica` y determina qué `StatsRenderer` monta la vista
 * pública. Patrón Template Method.
 *
 * Ciclo 35 TDD — Sprint 6. Ajustado en Ciclo 5 (Sprint 7).
 */
describe('StatsSubmissionForm', () => {
  const DATASET_VOCAB: VocabularyEntry[] = [
    { display: 'Docentes', value: 'docentes' },
    { display: 'Estudiantes', value: 'estudiantes' },
  ];

  let vocabApi: { getEntries: ReturnType<typeof vi.fn> };

  function buildCollection(uuid: string): Collection {
    return {
      uuid,
      name: 'Datos Estadísticos',
      handle: '123/1',
      archivedItemsCount: 0,
      type: 'collection',
      metadata: {},
    };
  }

  beforeEach(() => {
    vocabApi = {
      getEntries: vi.fn().mockReturnValue(of(DATASET_VOCAB)),
    };

    TestBed.configureTestingModule({
      imports: [StatsSubmissionForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: SubmissionFacade, useValue: { submitItem$: vi.fn() } },
        { provide: ItemAdminFacade, useValue: { editItem$: vi.fn() } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: VocabularyApiService, useValue: vocabApi },
      ],
    });
  });

  function mountForCreate(): StatsSubmissionForm {
    const fixture = TestBed.createComponent(StatsSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Verifica que el form declare la sección `digeex-estadistica` del submission process. */
  it('should declare digeex-estadistica as the submission section name', () => {
    const c = mountForCreate();
    expect(c.getSectionName()).toBe('digeex-estadistica');
  });

  /** Verifica que `visibility` arranque en `public` y refleje los cambios al signal. */
  it('should default visibility to public and reflect changes from the signal', () => {
    const c = mountForCreate();
    expect(c.getVisibility()).toBe('public');

    c.visibility.set('private');
    expect(c.getVisibility()).toBe('private');
  });

  /** Verifica que `getFiles` exponga el contenido del signal `files` (vacío por defecto, lleno cuando se setea). */
  it('should expose the Excel bitstream via getFiles from the signal', () => {
    const c = mountForCreate();
    expect(c.getFiles()).toEqual([]);

    const xlsx = new File([''], 'datos.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    c.files.set([xlsx]);
    expect(c.getFiles()).toEqual([xlsx]);
  });

  /** Verifica que el componente esté auto-registrado en el submission-form-registry bajo el entity-type Estadistica. */
  it('should register itself in the submission form registry under the Estadistica entity-type', () => {
    expect(getSubmissionFormComponent('Estadistica')).toBe(StatsSubmissionForm);
  });

  /**
   * Verifica que al inicializar el componente cargue el vocabulario `tipos-dataset-estadistica`
   * y exponga las entries en el signal `datasetOptions` para el dropdown del template.
   */
  it('should load tipos-dataset-estadistica on init and populate datasetOptions', () => {
    const c = mountForCreate();
    expect(vocabApi.getEntries).toHaveBeenCalledWith('tipos-dataset-estadistica');
    expect(c.datasetOptions()).toEqual(DATASET_VOCAB);
    expect(c.vocabulariesLoading()).toBe(false);
  });

  /**
   * Verifica que `buildMetadata` incluya las cuatro claves del schema digeex-estadistica
   * (`dc.title`, `dc.description.abstract`, `dc.date.issued`, `digeex.statsDataset`)
   * con los valores actuales del form.
   */
  it('should map title, abstract, date and digeex.statsDataset in buildMetadata when dataset is selected', () => {
    const c = mountForCreate();
    c.form.patchValue({
      title: 'Matrícula 2026',
      abstract: 'Distribución por subdirección',
      issued: '2026-04-30',
      dataset: 'docentes',
    });

    const metadata = c.buildMetadata();
    expect(metadata['dc.title']?.[0]?.value).toBe('Matrícula 2026');
    expect(metadata['dc.description.abstract']?.[0]?.value).toBe('Distribución por subdirección');
    expect(metadata['dc.date.issued']?.[0]?.value).toBe('2026-04-30');
    expect(metadata['digeex.statsDataset']?.[0]?.value).toBe('docentes');
  });

  /**
   * Verifica que `canSubmit` solo emita true cuando el form es válido y hay al menos un archivo.
   * Título, fecha, dataset y archivo son requeridos; descripción es opcional.
   */
  it('should require title, issued, dataset and at least one file in canSubmit', () => {
    const c = mountForCreate();
    expect(c.canSubmit()).toBe(false);

    c.form.patchValue({ title: 'Matrícula 2026' });
    expect(c.canSubmit()).toBe(false);

    c.form.patchValue({ issued: '2026-04-30' });
    expect(c.canSubmit()).toBe(false);

    c.form.patchValue({ dataset: 'docentes' });
    expect(c.canSubmit()).toBe(false);

    c.files.set([new File([''], 'datos.xlsx')]);
    expect(c.canSubmit()).toBe(true);
  });

  /**
   * Verifica que `afterSuccess` resetee el form (incluido `dataset`), los archivos y la
   * visibilidad al estado inicial para que el admin pueda subir otro item sin recargar.
   */
  it('should reset form, files, dataset and visibility back to initial state after a successful submit', () => {
    const c = mountForCreate();
    c.form.patchValue({
      title: 'Matrícula 2026',
      abstract: 'algo',
      issued: '2026-04-30',
      dataset: 'docentes',
    });
    c.files.set([new File([''], 'a.xlsx')]);
    c.visibility.set('private');

    (c as unknown as { afterSuccess: () => void }).afterSuccess();

    expect(c.form.value).toEqual({ title: '', abstract: '', issued: '', dataset: '' });
    expect(c.files()).toEqual([]);
    expect(c.visibility()).toBe('public');
  });

  /** Verifica que un Date en `issued` se serialice como YYYY-MM-DD local en buildMetadata. */
  it('should serialize a Date in issued as local YYYY-MM-DD in buildMetadata', () => {
    const c = mountForCreate();
    c.form.patchValue({
      title: 'Matrícula 2026',
      dataset: 'docentes',
      issued: new Date(2026, 3, 27) as unknown as string,
    });

    expect(c.buildMetadata()['dc.date.issued']?.[0]?.value).toBe('2026-04-27');
  });

  /** Verifica que un Date en `issued` se serialice como YYYY-MM-DD local en buildPatchFromForm. */
  it('should serialize a Date in issued as local YYYY-MM-DD in buildPatchFromForm', () => {
    const item: Item = {
      uuid: 'stat-1',
      name: 'Matrícula',
      handle: '123/8',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.date.issued': [
          { value: '2025-01-01', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(StatsSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: 'PEAC' });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({ issued: new Date(2026, 3, 27) as unknown as string });
    const patch = c.buildPatchFromForm(item);

    expect(patch).toEqual(
      expect.arrayContaining([
        { op: 'replace', path: '/metadata/dc.date.issued/0/value', value: '2026-04-27' },
      ]),
    );
  });
});
