import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { Subject, of } from 'rxjs';

import { GallerySubmissionForm } from './gallery-submission-form';
import { Collection } from '../../../../../core/api/models/collection.model';
import { Item } from '../../../../../core/api/models/item.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { ItemAdminFacade } from '../../../content/services/item-admin-facade';
import { VocabularyDisplayService } from '../../../../../core/api/vocabulary-display.service';
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
 * Ciclo 35 TDD — Sprint 6. Ajustado en Ciclos 29, 30 y 34, y Ciclo 21 (Sprint 9).
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

  let entriesFn: ReturnType<typeof vi.fn>;
  let editItemFn: ReturnType<typeof vi.fn>;
  let listOriginalFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    entriesFn = vi.fn().mockReturnValue(of([]));
    editItemFn = vi.fn().mockReturnValue(of({ uuid: 'item-1' }));
    listOriginalFn = vi
      .fn()
      .mockReturnValue(
        of({ items: [], totalElements: 0, totalPages: 0, size: 20, page: 0 }),
      );
    TestBed.configureTestingModule({
      imports: [GallerySubmissionForm],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        { provide: SubmissionFacade, useValue: { submitItem$: vi.fn() } },
        {
          provide: ItemAdminFacade,
          useValue: {
            editItem$: editItemFn,
            listOriginalBitstreams$: listOriginalFn,
          },
        },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: VocabularyDisplayService, useValue: { entries$: entriesFn } },
      ],
    });
  });

  /** Verifica que el form declare digeex-galeria como section name de la submission. */
  it('should declare digeex-galeria as the submission section name', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.getSectionName()).toBe('digeex-galeria');
  });

  /** Verifica que la visibilidad arranque en public y refleje cambios de la signal. */
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

  /** Verifica que getFiles devuelva las fotos del álbum cargadas en el signal. */
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

  /** Verifica que buildMetadata mapee cada campo del form a su clave dc.* o digeex.* correspondiente. */
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

  /** Verifica que el componente quede registrado bajo el entity-type Galeria. */
  it('should register itself in the submission form registry under the Galeria entity-type', () => {
    expect(getSubmissionFormComponent('Galeria')).toBe(GallerySubmissionForm);
  });

  /** Verifica que getCoverFile exponga la portada elegida por el usuario. */
  it('should expose the selected cover file via getCoverFile', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getCoverFile()).toBeNull();

    const cover = new File([''], 'portada.jpg', { type: 'image/jpeg' });
    c.onCoverChange([cover]);
    expect(c.getCoverFile()).toBe(cover);
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
    c.onCoverChange([new File([''], 'portada.jpg', { type: 'image/jpeg' })]);
    c.visibility.set('private');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).afterSuccess({ uuid: 'item-archived' });

    expect(c.form.value.title).toBe('');
    expect(c.form.value.abstract).toBe('');
    expect(c.form.value.author).toBe('');
    expect(c.form.value.classification).toBe('');
    expect(c.files()).toEqual([]);
    expect(c.coverFile()).toBeNull();
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

  /** Verifica que canSubmit habilite el envío sólo cuando el form es válido, hay fotos y hay portada. */
  it('should expose canSubmit=true only when the form is valid, there is at least one photo and a cover is selected', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    /* Form vacío: no se puede enviar. */
    expect(c.canSubmit()).toBe(false);

    /* Form lleno pero sin fotos y sin portada: no. */
    c.form.patchValue({
      title: 'Graduación PEAC',
      issued: '2026-04-15',
      type: 'Graduaciones',
      classification: 'PEAC',
    });
    expect(c.canSubmit()).toBe(false);

    /* Con foto pero sin portada: tampoco (Galería exige portada explícita). */
    c.files.set([new File([''], 'foto1.jpg', { type: 'image/jpeg' })]);
    expect(c.canSubmit()).toBe(false);

    /* Con portada también: ahora sí. */
    c.onCoverChange([new File([''], 'portada.jpg', { type: 'image/jpeg' })]);
    expect(c.canSubmit()).toBe(true);

    /* Si vaciamos el title vuelve a falso (form inválido). */
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

    /* Faltan los cuatro required; el form arranca inválido. */
    expect(c.form.invalid).toBe(true);

    /* Llenamos todos menos title: sigue inválido. */
    c.form.patchValue({
      title: '',
      issued: '2026-04-15',
      type: 'Graduaciones',
      classification: 'PEAC',
    });
    expect(c.form.invalid).toBe(true);

    /* Con title puesto y los demás llenos: válido. */
    c.form.patchValue({ title: 'Graduación PEAC' });
    expect(c.form.invalid).toBe(false);

    /* Quitamos classification: vuelve a inválido. */
    c.form.patchValue({ classification: '' });
    expect(c.form.invalid).toBe(true);
  });

  /** Verifica que vocabulariesLoading arranque en true y baje a false sólo cuando los cuatro vocabularios resolvieron. */
  it('should expose vocabulariesLoading=true while vocab requests are in flight and false after all four resolve', () => {
    const tipos$ = new Subject<{ display: string; value: string }[]>();
    const programas$ = new Subject<{ display: string; value: string }[]>();
    const poblacion$ = new Subject<{ display: string; value: string }[]>();
    const enfoque$ = new Subject<{ display: string; value: string }[]>();
    entriesFn.mockImplementation((name: string) => {
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

    /* Apenas se montó, ningún Subject emitió: spinner activo. */
    expect(c.vocabulariesLoading()).toBe(true);

    /* Tres resuelven, falta uno: spinner sigue activo (forkJoin espera al último). */
    tipos$.next([]); tipos$.complete();
    programas$.next([]); programas$.complete();
    poblacion$.next([]); poblacion$.complete();
    expect(c.vocabulariesLoading()).toBe(true);

    /* El cuarto cierra: forkJoin emite y vocabulariesLoading pasa a false. */
    enfoque$.next([]); enfoque$.complete();
    expect(c.vocabulariesLoading()).toBe(false);
  });

  /** Verifica que el form cargue los cuatro vocabularios del schema digeex-galeria al inicializarse. */
  it('should fetch tipos-evento, programas-digeex, tipo-poblacion and enfoque-imagen vocabularies on init', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(entriesFn).toHaveBeenCalledWith('tipos-evento');
    expect(entriesFn).toHaveBeenCalledWith('programas-digeex');
    expect(entriesFn).toHaveBeenCalledWith('tipo-poblacion');
    expect(entriesFn).toHaveBeenCalledWith('enfoque-imagen');
  });

  /** Verifica que con el input `item` el form se pre-llene desde item.metadata. */
  it('should pre-fill the form from item.metadata when the item input is provided', () => {
    const item: Item = {
      uuid: 'album-1',
      name: 'Álbum',
      handle: '123/9',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.title': [{ value: 'Álbum original', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description.abstract': [{ value: 'Descripción', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.type': [{ value: 'Capacitación', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.date.issued': [{ value: '2025-09-01', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.subject.classification': [{ value: 'PEAC', language: null, authority: null, confidence: -1, place: 0 }],
      },
    };

    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: 'PEAC' });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.value.title).toBe('Álbum original');
    expect(c.form.value.abstract).toBe('Descripción');
    expect(c.form.value.type).toBe('Capacitación');
    expect(c.form.value.classification).toBe('PEAC');
  });

  /** Verifica que un Date en `issued` se serialice como YYYY-MM-DD local en buildMetadata. */
  it('should serialize a Date in issued as local YYYY-MM-DD in buildMetadata', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Álbum',
      abstract: '',
      type: 'Capacitación',
      issued: new Date(2026, 3, 27) as unknown as string,
      author: '',
      classification: 'PEAC',
      populationType: '',
      imageFocus: '',
    });

    expect(c.buildMetadata()['dc.date.issued']?.[0]?.value).toBe('2026-04-27');
  });

  /** Verifica que un Date en `issued` se serialice como YYYY-MM-DD local en buildPatchFromForm. */
  it('should serialize a Date in issued as local YYYY-MM-DD in buildPatchFromForm', () => {
    const item: Item = {
      uuid: 'album-1',
      name: 'Álbum',
      handle: '123/9',
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

    const fixture = TestBed.createComponent(GallerySubmissionForm);
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

  /** Verifica que al entrar a edit con un álbum se pida la primera página de fotos del ORIGINAL. */
  it('should fetch the first page of ORIGINAL bitstreams when entering edit mode', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Álbum',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {},
    };

    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(listOriginalFn).toHaveBeenCalledWith('item-1', 0, 20);
  });

  /** Verifica que currentBitstreams y contadores de paginación se llenen desde la respuesta del facade. */
  it('should populate currentBitstreams and pagination signals from the facade response', () => {
    listOriginalFn.mockReturnValue(
      of({
        items: [
          { uuid: 'bs-1', name: 'foto1.jpg', sizeBytes: 12345 },
          { uuid: 'bs-2', name: 'foto2.jpg', sizeBytes: 67890 },
        ],
        totalElements: 150,
        totalPages: 8,
        size: 20,
        page: 0,
      }),
    );
    const item: Item = {
      uuid: 'item-1',
      name: 'Álbum',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {},
    };

    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.currentBitstreams().map((b) => b.uuid)).toEqual(['bs-1', 'bs-2']);
    expect(c.currentBitstreamsTotal()).toBe(150);
  });

  /** Verifica que togglePendingDelete maneje el set de uuids y getBitstreamsToRemove devuelva la lista. */
  it('should toggle uuids in pendingDeletes and expose them via getBitstreamsToRemove', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.togglePendingDelete('bs-1');
    c.togglePendingDelete('bs-2');
    expect((c as unknown as { getBitstreamsToRemove(): string[] }).getBitstreamsToRemove().sort()).toEqual(['bs-1', 'bs-2']);

    c.togglePendingDelete('bs-1');
    expect((c as unknown as { getBitstreamsToRemove(): string[] }).getBitstreamsToRemove()).toEqual(['bs-2']);
  });

  /**
   * Verifica que onAddBitstreams reemplace pendingAdds con la lista que emite el dropzone.
   * El dropzone es la única fuente: al quitar un archivo reemite su lista completa sin él.
   */
  it('should replace pendingAdds with the dropzone list and expose it via getBitstreamsToAdd', () => {
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    c.onAddBitstreams([f1, f2]);
    expect((c as unknown as { getBitstreamsToAdd(): File[] }).getBitstreamsToAdd()).toEqual([f1, f2]);

    c.onAddBitstreams([f2]);
    expect((c as unknown as { getBitstreamsToAdd(): File[] }).getBitstreamsToAdd()).toEqual([f2]);
  });

  /** Verifica que onBitstreamPageChange recargue la página solicitada con el size elegido. */
  it('should reload original bitstreams with the page and size from onBitstreamPageChange', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Álbum',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {},
    };
    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    listOriginalFn.mockClear();
    c.onBitstreamPageChange({ page: 3, rows: 100 });
    expect(listOriginalFn).toHaveBeenCalledWith('item-1', 3, 100);
  });

  /** Verifica que canSubmit bloquee el envío cuando el conteo efectivo de fotos queda en cero. */
  it('should block canSubmit in edit mode when effective file count drops to zero', () => {
    listOriginalFn.mockReturnValue(
      of({
        items: [
          { uuid: 'bs-1', name: 'foto1.jpg', sizeBytes: 1000 },
        ],
        totalElements: 1,
        totalPages: 1,
        size: 20,
        page: 0,
      }),
    );
    const item: Item = {
      uuid: 'item-1',
      name: 'Álbum',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.title': [
          { value: 'Álbum', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.type': [
          { value: 'Acto', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.date.issued': [
          { value: '2026-04-15', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.subject.classification': [
          { value: 'PEAC', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(GallerySubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.canSubmit()).toBe(true);

    c.togglePendingDelete('bs-1');
    expect(c.canSubmit()).toBe(false);

    c.onAddBitstreams([new File(['x'], 'nueva.jpg', { type: 'image/jpeg' })]);
    expect(c.canSubmit()).toBe(true);
  });
});
