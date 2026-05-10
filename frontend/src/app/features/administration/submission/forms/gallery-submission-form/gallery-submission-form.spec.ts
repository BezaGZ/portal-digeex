import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { Subject, of } from 'rxjs';

import { GallerySubmissionForm } from './gallery-submission-form';
import { Collection } from '../../../../../core/api/models/collection.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { VocabularyApiService } from '../../../../../core/api/vocabulary-api.service';
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

  let getEntriesFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getEntriesFn = vi.fn().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [GallerySubmissionForm],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        { provide: SubmissionFacade, useValue: { submitItem$: vi.fn() } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: VocabularyApiService, useValue: { getEntries: getEntriesFn } },
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

  /** Verifica que dc.contributor.author se mapee como una sola entry trimmed cuando el campo viene relleno. */
  it('should map dc.contributor.author as a single trimmed entry when filled', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Graduación PEAC',
      issued: '2026-04-15',
      type: 'Graduaciones',
      classification: 'PEAC',
      author: '  Equipo PEAC  ',
    });

    const authors = c.buildMetadata()['dc.contributor.author'] ?? [];
    expect(authors.map((mv) => mv.value)).toEqual(['Equipo PEAC']);
  });

  /** Verifica que tras un submit exitoso el form, files y visibility vuelvan al estado inicial. */
  it('should reset form, files and visibility back to initial state after a successful submit', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.setValue({
      title: 'Graduación PEAC',
      abstract: 'Ceremonia de cierre',
      type: 'Graduaciones',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      classification: 'PEAC',
      populationType: 'Mujeres jóvenes',
      imageFocus: 'Infraestructura',
    });
    c.files.set([new File([''], 'foto1.jpg', { type: 'image/jpeg' })]);
    c.visibility.set('private');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).afterSuccess({ uuid: 'item-archived' });

    expect(c.form.value.title).toBe('');
    expect(c.form.value.abstract).toBe('');
    expect(c.form.value.author).toBe('');
    expect(c.form.value.classification).toBe('');
    expect(c.files()).toEqual([]);
    expect(c.visibility()).toBe('public');
  });

  /** Verifica que dc.contributor.author no aparezca en el metadata cuando el field está vacío. */
  it('should NOT include dc.contributor.author when the author field is empty', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Graduación PEAC',
      issued: '2026-04-15',
      type: 'Graduaciones',
      classification: 'PEAC',
      author: '',
    });

    expect(c.buildMetadata()['dc.contributor.author']).toBeUndefined();
  });

  /** Verifica que canSubmit habilite el envío sólo cuando el form es válido y hay al menos una foto cargada. */
  it('should expose canSubmit=true only when the form is valid and at least one photo is uploaded', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // Form vacío y sin fotos: no se puede enviar.
    expect(c.canSubmit()).toBe(false);

    // Form lleno pero sin fotos: tampoco se puede (un álbum sin fotos no tiene sentido).
    c.form.patchValue({
      title: 'Graduación PEAC',
      issued: '2026-04-15',
      type: 'Graduaciones',
      classification: 'PEAC',
    });
    expect(c.canSubmit()).toBe(false);

    // Form lleno + al menos una foto: ahora sí.
    c.files.set([new File([''], 'foto1.jpg', { type: 'image/jpeg' })]);
    expect(c.canSubmit()).toBe(true);

    // Si vaciamos el title vuelve a falso (form inválido aunque haya foto).
    c.form.patchValue({ title: '' });
    expect(c.canSubmit()).toBe(false);
  });

  /** Verifica que el form quede inválido cuando alguno de los required del schema digeex-galeria está vacío. */
  it('should mark the form invalid when title, issued, type or classification are empty', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // Faltan los cuatro required; el form arranca inválido.
    expect(c.form.invalid).toBe(true);

    // Llenamos todos menos title: sigue inválido.
    c.form.patchValue({
      title: '',
      issued: '2026-04-15',
      type: 'Graduaciones',
      classification: 'PEAC',
    });
    expect(c.form.invalid).toBe(true);

    // Con title puesto y los demás llenos: válido.
    c.form.patchValue({ title: 'Graduación PEAC' });
    expect(c.form.invalid).toBe(false);

    // Quitamos classification: vuelve a inválido.
    c.form.patchValue({ classification: '' });
    expect(c.form.invalid).toBe(true);
  });

  /** Verifica que vocabulariesLoading arranque en true y baje a false sólo cuando los cuatro vocabularios resolvieron. */
  it('should expose vocabulariesLoading=true while vocab requests are in flight and false after all four resolve', () => {
    const tipos$ = new Subject<{ display: string; value: string }[]>();
    const programas$ = new Subject<{ display: string; value: string }[]>();
    const poblacion$ = new Subject<{ display: string; value: string }[]>();
    const enfoque$ = new Subject<{ display: string; value: string }[]>();
    getEntriesFn.mockImplementation((name: string) => {
      if (name === 'tipos-evento') return tipos$;
      if (name === 'programas-digeex') return programas$;
      if (name === 'tipo-poblacion') return poblacion$;
      if (name === 'enfoque-imagen') return enfoque$;
      return of([]);
    });

    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // Apenas se montó, ningún Subject emitió: spinner activo.
    expect(c.vocabulariesLoading()).toBe(true);

    // Tres resuelven, falta uno: spinner sigue activo (forkJoin espera al último).
    tipos$.next([]); tipos$.complete();
    programas$.next([]); programas$.complete();
    poblacion$.next([]); poblacion$.complete();
    expect(c.vocabulariesLoading()).toBe(true);

    // El cuarto cierra: forkJoin emite y vocabulariesLoading pasa a false.
    enfoque$.next([]); enfoque$.complete();
    expect(c.vocabulariesLoading()).toBe(false);
  });

  /** Verifica que el form cargue los cuatro vocabularios del schema digeex-galeria al inicializarse. */
  it('should fetch tipos-evento, programas-digeex, tipo-poblacion and enfoque-imagen vocabularies on init', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(getEntriesFn).toHaveBeenCalledWith('tipos-evento');
    expect(getEntriesFn).toHaveBeenCalledWith('programas-digeex');
    expect(getEntriesFn).toHaveBeenCalledWith('tipo-poblacion');
    expect(getEntriesFn).toHaveBeenCalledWith('enfoque-imagen');
  });
});
