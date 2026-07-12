import { TestBed } from '@angular/core/testing';
import { QueryList } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { Subject, of } from 'rxjs';

import { DocumentSubmissionForm } from './document-submission-form';
import { FileDropzoneComponent } from '../../../../../shared';
import { Collection } from '../../../../../core/api/models/collection.model';
import { Item } from '../../../../../core/api/models/item.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { ItemAdminFacade } from '../../../content/services/item-admin-facade';
import { VocabularyDisplayService } from '../../../../../core/api/vocabulary-display.service';
import { CommunityApiService } from '../../../../../core/api/community-api.service';
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
 * Ciclo 23 TDD — Sprint 6. Ajustado en Ciclo 35 y Ciclo 21 (Sprint 9), y Ciclos 21, 45 y 60 (Sprint 10).
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

  let entriesFn: ReturnType<typeof vi.fn>;
  let editItemFn: ReturnType<typeof vi.fn>;
  let listOriginalFn: ReturnType<typeof vi.fn>;
  let searchTopFn: ReturnType<typeof vi.fn>;
  let listSubsFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    entriesFn = vi.fn().mockReturnValue(of([]));
    editItemFn = vi.fn().mockReturnValue(of({ uuid: 'item-1' }));
    listOriginalFn = vi
      .fn()
      .mockReturnValue(
        of({ items: [], totalElements: 0, totalPages: 0, size: 20, page: 0 }),
      );
    searchTopFn = vi.fn().mockReturnValue(of({ _embedded: { communities: [{ uuid: 'root' }] } }));
    listSubsFn = vi.fn().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [DocumentSubmissionForm],
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
        {
          provide: CommunityApiService,
          useValue: { searchTop: searchTopFn, listAllSubcommunities: listSubsFn },
        },
      ],
    });
  });

  /** Verifica que el form declare digeex-documento como section name de la submission. */
  it('should declare digeex-documento as the submission section name', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.getSectionName()).toBe('digeex-documento');
  });

  /** Verifica que la visibilidad arranque en public y refleje cambios de la signal. */
  it('should default visibility to public and reflect changes from the signal', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getVisibility()).toBe('public');

    c.visibility.set('private');
    expect(c.getVisibility()).toBe('private');
  });

  /**
   * Verifica que el toggle de visibilidad se oculte al personal_delegado.
   * No accede a Recursos: un item privado suyo le quedaría irrecuperable.
   */
  it('should hide the visibility toggle for a personal_delegado caller', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'personal_delegado', scopeUuid: 'PEAC' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#visibility')).toBeNull();
  });

  /** Verifica que superadmin y admin_subdireccion conserven el toggle de visibilidad. */
  it('should keep the visibility toggle for superadmin and admin_subdireccion callers', () => {
    for (const caller of [
      { role: 'superadmin', scopeUuid: null },
      { role: 'admin_subdireccion', scopeUuid: 'ED_BASICA' },
    ]) {
      const fixture = TestBed.createComponent(DocumentSubmissionForm);
      fixture.componentRef.setInput('collection', buildCollection('col-1'));
      fixture.componentRef.setInput('caller', caller);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#visibility')).not.toBeNull();
    }
  });

  /** Verifica que getFiles exponga el contenido de la signal files. */
  it('should expose the files signal via getFiles', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getFiles()).toEqual([]);

    const pdf = new File([''], 'doc.pdf', { type: 'application/pdf' });
    c.files.set([pdf]);
    expect(c.getFiles()).toEqual([pdf]);
  });

  /** Verifica que buildMetadata mapee cada campo del form a su clave dc.* correspondiente. */
  it('should map every form field to its dc.* key in buildMetadata', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.setValue({
      title: 'Manual PEAC',
      abstract: 'Resumen del manual',
      type: 'Manual',
      audience: 'Primaria',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      publisher: '',
      subject: 'educación, adultos',
      language: 'es',
      relationUri: '',
      isVideo: false,
    });

    const metadata = c.buildMetadata();

    expect(metadata['dc.title']?.[0]?.value).toBe('Manual PEAC');
    expect(metadata['dc.description.abstract']?.[0]?.value).toBe('Resumen del manual');
    expect(metadata['dc.type']?.[0]?.value).toBe('Manual');
    expect(metadata['dcterms.educationLevel']?.[0]?.value).toBe('Primaria');
    expect(metadata['dc.date.issued']?.[0]?.value).toBe('2026-04-15');
    expect(metadata['dc.contributor.author']?.[0]?.value).toBe('Equipo PEAC');
    expect(metadata['dc.subject']?.map((mv) => mv.value)).toEqual(['educación', 'adultos']);
    expect(metadata['dc.language.iso']?.[0]?.value).toBe('es');
    expect(metadata['dc.relation.uri']).toBeUndefined();
  });

  /** Verifica que con isVideo activo, dc.type pase a Video y se incluya dc.relation.uri. */
  it('should override dc.type to Video and include dc.relation.uri when the isVideo toggle is on', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.setValue({
      title: 'Charla de adultos',
      abstract: 'Resumen del video',
      type: 'Manual',
      audience: '',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      publisher: '',
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

  /** Verifica que getFiles devuelva [] en modo Video aunque haya archivos en la signal. */
  it('should ignore the files signal and return [] in getFiles when isVideo is on', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const pdf = new File([''], 'doc.pdf', { type: 'application/pdf' });
    c.files.set([pdf]);
    c.form.patchValue({ isVideo: true });

    expect(c.getFiles()).toEqual([]);
  });

  /** Verifica que el componente quede registrado bajo el entity-type Documento. */
  it('should register itself in the submission form registry under the Documento entity-type', () => {
    expect(getSubmissionFormComponent('Documento')).toBe(DocumentSubmissionForm);
  });

  /** Verifica que vocabulariesLoading arranque en true y baje a false sólo cuando los tres vocabularios resolvieron. */
  it('should expose vocabulariesLoading=true while vocab requests are in flight and false after all three resolve', () => {
    const tipos$ = new Subject<{ display: string; value: string }[]>();
    const niveles$ = new Subject<{ display: string; value: string }[]>();
    const idiomas$ = new Subject<{ display: string; value: string }[]>();
    entriesFn.mockImplementation((name: string) => {
      if (name === 'tipos-documento') return tipos$;
      if (name === 'niveles-educativos') return niveles$;
      if (name === 'idiomas-digeex') return idiomas$;
      return of([]);
    });

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.vocabulariesLoading()).toBe(true);

    tipos$.next([]); tipos$.complete();
    niveles$.next([]); niveles$.complete();
    expect(c.vocabulariesLoading()).toBe(true);

    idiomas$.next([]); idiomas$.complete();
    expect(c.vocabulariesLoading()).toBe(false);
  });

  /** Verifica que en init se carguen los vocabularios tipos-documento, niveles-educativos e idiomas-digeex. */
  it('should fetch tipos-documento, niveles-educativos and idiomas-digeex vocabularies on init', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(entriesFn).toHaveBeenCalledWith('tipos-documento');
    expect(entriesFn).toHaveBeenCalledWith('niveles-educativos');
    expect(entriesFn).toHaveBeenCalledWith('idiomas-digeex');
  });

  /** Verifica que las entries del vocabulario se expongan a través de las signals tipoDocumentoOptions y audienceOptions. */
  it('should expose vocabulary entries via tipoDocumentoOptions and audienceOptions signals', () => {
    const tipos = [
      { display: 'Manual', value: 'Manual' },
      { display: 'Guía', value: 'Guía' },
    ];
    const niveles = [
      { display: 'Primaria', value: 'Primaria' },
      { display: 'Básico', value: 'Básico' },
    ];
    entriesFn.mockImplementation((name: string) => {
      if (name === 'tipos-documento') return of(tipos);
      if (name === 'niveles-educativos') return of(niveles);
      return of([]);
    });

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.tipoDocumentoOptions()).toEqual(tipos);
    expect(c.audienceOptions()).toEqual(niveles);
  });

  /** Verifica que el form quede inválido si el título está vacío. */
  it('should mark the form invalid when title is empty', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: '',
      type: 'Manual',
      audience: 'Primaria',
      issued: '2026-04-15',
    });

    expect(c.form.invalid).toBe(true);
  });

  /** Verifica que el form quede inválido si type está vacío en modo Documento. */
  it('should mark the form invalid when type is empty and isVideo is false', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Manual PEAC',
      abstract: 'Resumen',
      issued: '2026-04-15',
      type: '',
      audience: 'Primaria',
      isVideo: false,
    });

    expect(c.form.invalid).toBe(true);
  });

  /** Verifica que en modo Video el form requiera relationUri y se valide solo con URL bien formada. */
  it('should mark the form invalid when isVideo is true but relationUri is empty', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Charla de adultos',
      abstract: 'Resumen del video',
      issued: '2026-04-15',
      isVideo: true,
      relationUri: '',
    });

    expect(c.form.invalid).toBe(true);

    // Y queda válido cuando se llena con una URL bien formada.
    c.form.patchValue({ relationUri: 'https://www.youtube.com/watch?v=abc123' });
    expect(c.form.invalid).toBe(false);
  });

  /** Verifica que canSubmit refleje la presencia de archivo en modo Documento y de URL en modo Video. */
  it('should expose canSubmit=false when files are missing in Documento mode and true when isVideo is on', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // Form lleno sin archivo, modo Documento: canSubmit=false porque falta el PDF.
    c.form.patchValue({
      title: 'Manual PEAC',
      abstract: 'Resumen',
      issued: '2026-04-15',
      type: 'Manual',
      audience: 'Primaria',
      isVideo: false,
    });
    c.files.set([]);
    expect(c.canSubmit()).toBe(false);

    // Cuando se sube el PDF queda canSubmit=true.
    c.files.set([new File([''], 'doc.pdf', { type: 'application/pdf' })]);
    expect(c.canSubmit()).toBe(true);

    // Modo Video sin archivo pero con URL: canSubmit=true porque la URL reemplaza al PDF.
    c.files.set([]);
    c.form.patchValue({ isVideo: true, relationUri: 'https://youtu.be/x' });
    expect(c.canSubmit()).toBe(true);
  });

  /** Verifica que cancel() navegue a /administrador/cargar. */
  it('should navigate to /administrador/cargar when cancel is called', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = router.navigate as ReturnType<typeof vi.fn>;

    fixture.componentInstance.cancel();

    expect(navigate).toHaveBeenCalledWith(['/administrador/cargar']);
  });

  /** Verifica que el campo subject se divida por coma en un MetadataValue por keyword sin espacios ni vacíos. */
  it('should split the subject field by comma into one MetadataValue per keyword (trimmed, no empties)', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Manual',
      abstract: 'Resumen',
      type: 'Manual',
      audience: 'Primaria',
      issued: '2026-04-15',
      author: 'Equipo',
      subject: 'educación, adultos ,  ciudadanía,, ',
      language: 'es',
      isVideo: false,
    });

    const metadata = c.buildMetadata();
    const subjects = metadata['dc.subject'] ?? [];

    expect(subjects.map((mv) => mv.value)).toEqual(['educación', 'adultos', 'ciudadanía']);
  });

  /** Verifica que el campo publisher se mapee a dc.publisher cuando viene relleno. */
  it('should map the publisher field to dc.publisher in buildMetadata when filled', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Manual',
      abstract: 'Resumen',
      type: 'Manual',
      audience: 'Primaria',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      publisher: 'Subdirección de Educación Bilingüe',
      subject: '',
      language: 'es',
      isVideo: false,
    });

    const metadata = c.buildMetadata();
    expect(metadata['dc.publisher']?.[0]?.value).toBe(
      'Subdirección de Educación Bilingüe',
    );
  });

  /** Verifica que dc.publisher no se incluya en metadata si el campo está vacío. */
  it('should NOT include dc.publisher when the publisher field is empty', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Manual',
      abstract: 'Resumen',
      type: 'Manual',
      audience: 'Primaria',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      publisher: '',
      subject: '',
      language: 'es',
      isVideo: false,
    });

    const metadata = c.buildMetadata();
    expect(metadata['dc.publisher']).toBeUndefined();
  });

  /** Verifica que acceptedFileTypes cubra los formatos ofimáticos esperados (Word, Excel, PowerPoint, ODF, plain text). */
  it('should expose acceptedFileTypes covering office formats', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const expected = [
      '.pdf',
      '.doc',
      '.docx',
      '.odt',
      '.rtf',
      '.txt',
      '.xls',
      '.xlsx',
      '.ods',
      '.csv',
      '.ppt',
      '.pptx',
      '.odp',
    ];
    for (const ext of expected) {
      expect(c.acceptedFileTypes).toContain(ext);
    }
  });

  /** Verifica que tras submit exitoso el form, files, cover y visibility vuelvan a su estado inicial. */
  it('should reset form, files, cover and visibility back to initial state after a successful submit', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // Llenamos el form como si el usuario fuera a enviar.
    c.form.setValue({
      title: 'Manual PEAC',
      abstract: 'Resumen del manual',
      type: 'Manual',
      audience: 'Primaria',
      issued: '2026-04-15',
      author: 'Equipo PEAC',
      publisher: '',
      subject: 'educación, adultos',
      language: 'es',
      relationUri: '',
      isVideo: false,
    });
    c.files.set([new File([''], 'a.pdf', { type: 'application/pdf' })]);
    c.coverFile.set(new File([''], 'cover.jpg', { type: 'image/jpeg' }));
    c.visibility.set('private');

    // Simulamos el éxito del facade llamando al hook expuesto por la base.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).afterSuccess({ uuid: 'item-archived' });

    // Form vuelve a sus defaults; isVideo permanece false (modo Documento por default).
    expect(c.form.value.title).toBe('');
    expect(c.form.value.abstract).toBe('');
    expect(c.form.value.subject).toBe('');
    expect(c.form.value.isVideo).toBe(false);
    expect(c.files()).toEqual([]);
    expect(c.coverFile()).toBeNull();
    expect(c.visibility()).toBe('public');
  });

  /**
   * Verifica que tras un submit exitoso en modo creación se limpie el estado
   * visual de los dropzones renderizados (principal + portada), no solo las
   * signals: PrimeNG mantiene su lista interna de archivos que el reset de
   * signals no toca.
   */
  it('should clear the rendered file dropzones after a successful submit in create mode', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const dropzones = (c as unknown as { dropzones: QueryList<FileDropzoneComponent> }).dropzones;
    const spies = dropzones.map((d) => vi.spyOn(d, 'clear'));
    expect(spies.length).toBeGreaterThan(0);

    (c as unknown as { afterSuccess: () => void }).afterSuccess();

    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });

  /** Verifica que getCoverFile exponga el cover elegido tanto en modo Documento como en modo Video. */
  it('should expose the selected cover file via getCoverFile in both Documento and Video modes', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getCoverFile()).toBeNull();

    const cover = new File([''], 'portada.jpg', { type: 'image/jpeg' });
    c.onCoverChange([cover]);
    expect(c.getCoverFile()).toBe(cover);

    c.form.patchValue({ isVideo: true });
    expect(c.getCoverFile()).toBe(cover);
  });

  /** Verifica que acceptedFileTypes se aplique al input nativo del p-fileupload del formulario. */
  it('should bind acceptedFileTypes to the document p-fileupload accept input', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const nativeInput = fixture.nativeElement.querySelector(
      'p-fileupload input[type="file"]',
    ) as HTMLInputElement | null;
    expect(nativeInput).not.toBeNull();
    expect(nativeInput!.accept).toBe(c.acceptedFileTypes);
    expect(nativeInput!.accept).toContain('.xlsx');
  });

  /** Verifica que con el input `item` el form se pre-llene desde item.metadata. */
  it('should pre-fill the form from item.metadata when the item input is provided', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Manual',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.title': [{ value: 'Manual original', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description.abstract': [{ value: 'Resumen original', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.type': [{ value: 'Manual', language: null, authority: null, confidence: -1, place: 0 }],
        'dcterms.educationLevel': [{ value: 'Primaria', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.date.issued': [{ value: '2025-01-01', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.contributor.author': [{ value: 'PEAC', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.subject': [
          { value: 'educación', language: null, authority: null, confidence: -1, place: 0 },
          { value: 'adultos', language: null, authority: null, confidence: -1, place: 1 },
        ],
        'dc.language.iso': [{ value: 'es', language: null, authority: null, confidence: -1, place: 0 }],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: 'PEAC' });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // getRawValue incluye el toggle isVideo que en edición queda disabled.
    const v = c.form.getRawValue();
    expect(v.title).toBe('Manual original');
    expect(v.abstract).toBe('Resumen original');
    expect(v.type).toBe('Manual');
    expect(v.audience).toBe('Primaria');
    expect(v.author).toBe('PEAC');
    expect(v.subject).toBe('educación, adultos');
    expect(v.language).toBe('es');
    expect(v.isVideo).toBe(false);
    // Visibility se inicializa desde el flag nativo discoverable; un item
    // con discoverable=true entra al form como 'public'.
    expect(c.visibility()).toBe('public');
  });

  /** Verifica que el signal visibility se inicialice desde item.discoverable al entrar a edit. */
  it('should sync visibility to private when entering edit mode with discoverable=false', () => {
    const item: Item = {
      uuid: 'item-priv',
      name: 'Privado',
      handle: '123/2',
      inArchive: true,
      discoverable: false,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.title': [{ value: 'Privado', language: null, authority: null, confidence: -1, place: 0 }],
      },
    };
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: 'PEAC' });
    fixture.detectChanges();

    expect(fixture.componentInstance.visibility()).toBe('private');
  });

  /** Verifica que en modo edición submit dispare ItemAdminFacade.editItem$ con el JSON Patch del diff. */
  it('should dispatch editItem$ with the JSON Patch derived from the form when submit is called in edit mode', () => {
    const item: Item = {
      uuid: 'item-42',
      name: 'Manual',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.title': [{ value: 'Título viejo', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description.abstract': [{ value: 'Resumen', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.type': [{ value: 'Manual', language: null, authority: null, confidence: -1, place: 0 }],
        'dcterms.educationLevel': [{ value: 'Primaria', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.date.issued': [{ value: '2025-01-01', language: null, authority: null, confidence: -1, place: 0 }],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: 'PEAC' });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({ title: 'Título nuevo' });
    c.submit();

    expect(editItemFn).toHaveBeenCalledTimes(1);
    const [uuid, payload, sufijo] = editItemFn.mock.calls[0];
    expect(uuid).toBe('item-42');
    expect(sufijo).toBe('PEAC');
    expect(payload.patch).toEqual(
      expect.arrayContaining([
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'Título nuevo' },
      ]),
    );
    expect(payload.item.uuid).toBe('item-42');
  });

  /** Verifica que un cambio aislado de visibility dispare editItem$ aunque no haya diff de metadata. */
  it('should dispatch editItem$ when only visibility changed, without showing the "Sin cambios" toast', () => {
    const item: Item = {
      uuid: 'item-pv',
      name: 'X',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.title': [{ value: 'X', language: null, authority: null, confidence: -1, place: 0 }],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: 'PEAC' });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.visibility.set('private');
    c.submit();

    expect(editItemFn).toHaveBeenCalledTimes(1);
    const [, payload] = editItemFn.mock.calls[0];
    expect(payload.visibility).toBe('private');
  });

  /** Verifica que un Date en `issued` se serialice como YYYY-MM-DD local en buildMetadata. */
  it('should serialize a Date in issued as local YYYY-MM-DD in buildMetadata', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({
      title: 'Manual PEAC',
      abstract: 'Resumen',
      type: 'Manual',
      audience: 'Primaria',
      issued: new Date(2026, 3, 27) as unknown as string,
      author: '',
      publisher: '',
      subject: '',
      language: '',
      relationUri: '',
      isVideo: false,
    });

    expect(c.buildMetadata()['dc.date.issued']?.[0]?.value).toBe('2026-04-27');
  });

  /** Verifica que currentBitstreams y los contadores de paginación se llenen desde la respuesta del facade. */
  it('should populate currentBitstreams and pagination signals from the facade response', () => {
    listOriginalFn.mockReturnValue(
      of({
        items: [
          { uuid: 'bs-1', name: 'a.pdf', sizeBytes: 1024 },
          { uuid: 'bs-2', name: 'b.pdf', sizeBytes: 2048 },
        ],
        totalElements: 47,
        totalPages: 3,
        size: 20,
        page: 0,
      }),
    );
    const item: Item = {
      uuid: 'item-1',
      name: 'Manual',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.type': [
          { value: 'Manual', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.currentBitstreams().map((b) => b.uuid)).toEqual(['bs-1', 'bs-2']);
    expect(c.currentBitstreamsTotal()).toBe(47);
    expect(c.currentBitstreamsPage()).toBe(0);
    expect(c.currentBitstreamsSize()).toBe(20);
  });

  /** Verifica que canSubmit bloquee el envío en edit no-Video cuando todo está marcado para borrar y no hay agregados. */
  it('should block canSubmit in edit mode when effective file count drops to zero (non-Video)', () => {
    listOriginalFn.mockReturnValue(
      of({
        items: [
          { uuid: 'bs-1', name: 'a.pdf', sizeBytes: 1000 },
          { uuid: 'bs-2', name: 'b.pdf', sizeBytes: 2000 },
        ],
        totalElements: 2,
        totalPages: 1,
        size: 20,
        page: 0,
      }),
    );
    const item: Item = {
      uuid: 'item-1',
      name: 'Manual',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.type': [
          { value: 'Manual', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.title': [
          { value: 'Manual', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.description.abstract': [
          { value: 'Resumen', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dcterms.educationLevel': [
          { value: 'Primaria', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.date.issued': [
          { value: '2026-04-15', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.canSubmit()).toBe(true);

    c.togglePendingDelete('bs-1');
    c.togglePendingDelete('bs-2');
    expect(c.canSubmit()).toBe(false);

    c.onAddBitstreams([new File(['x'], 'nuevo.pdf', { type: 'application/pdf' })]);
    expect(c.canSubmit()).toBe(true);
  });

  /** Verifica que onBitstreamPageChange dispare una nueva carga con el page y size que llega del paginator. */
  it('should reload original bitstreams with the page and size from onBitstreamPageChange', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Manual',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.type': [
          { value: 'Manual', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // La primera invocación ya quedó: page=0,size=20 al entrar a edit.
    listOriginalFn.mockClear();

    c.onBitstreamPageChange({ page: 2, rows: 50 });
    expect(listOriginalFn).toHaveBeenCalledWith('item-1', 2, 50);
  });

  /**
   * Verifica que onAddBitstreams reemplace pendingAdds con la lista que emite el dropzone.
   * El dropzone es la única fuente: al quitar un archivo reemite su lista completa sin él.
   */
  it('should replace pendingAdds with the dropzone list and expose it via getBitstreamsToAdd', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect((c as unknown as { getBitstreamsToAdd(): File[] }).getBitstreamsToAdd()).toEqual([]);

    const f1 = new File(['a'], 'a.pdf', { type: 'application/pdf' });
    const f2 = new File(['b'], 'b.pdf', { type: 'application/pdf' });
    c.onAddBitstreams([f1, f2]);
    expect((c as unknown as { getBitstreamsToAdd(): File[] }).getBitstreamsToAdd()).toEqual([f1, f2]);

    c.onAddBitstreams([f2]);
    expect((c as unknown as { getBitstreamsToAdd(): File[] }).getBitstreamsToAdd()).toEqual([f2]);
  });

  /** Verifica que togglePendingDelete agregue/quite uuids y getBitstreamsToRemove devuelva la lista. */
  it('should toggle uuids in pendingDeletes and expose them via getBitstreamsToRemove', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect((c as unknown as { getBitstreamsToRemove(): string[] }).getBitstreamsToRemove()).toEqual([]);

    c.togglePendingDelete('bs-1');
    c.togglePendingDelete('bs-2');
    expect((c as unknown as { getBitstreamsToRemove(): string[] }).getBitstreamsToRemove().sort()).toEqual(['bs-1', 'bs-2']);
    expect(c.isPendingDelete('bs-1')).toBe(true);

    c.togglePendingDelete('bs-1');
    expect((c as unknown as { getBitstreamsToRemove(): string[] }).getBitstreamsToRemove()).toEqual(['bs-2']);
    expect(c.isPendingDelete('bs-1')).toBe(false);
  });

  /**
   * Verifica que en edit Video se pida un único bitstream del ORIGINAL para
   * capturar el uuid del marcador _video_link.txt y poder reemplazarlo si la
   * URL cambia. El usuario no ve la lista en UI; es metadata interna.
   */
  it('should fetch a single bitstream of the ORIGINAL bundle in Video edit mode to capture the marker uuid', () => {
    const item: Item = {
      uuid: 'item-vid',
      name: 'Charla',
      handle: '123/9',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.type': [
          { value: 'Video', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(listOriginalFn).toHaveBeenCalledWith('item-vid', 0, 1);
  });

  /**
   * Verifica que en edit Video, si la URL no cambió, los hooks devuelven listas
   * vacías: nada que subir, nada que borrar.
   */
  it('should return empty add/remove lists in Video edit mode when the URL is unchanged', () => {
    listOriginalFn.mockReturnValue(
      of({
        items: [{ uuid: 'marker-uuid', name: '_video_link.txt', sizeBytes: 30 }],
        totalElements: 1,
        totalPages: 1,
        size: 1,
        page: 0,
      }),
    );
    const item: Item = {
      uuid: 'item-vid',
      name: 'Charla',
      handle: '123/9',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.type': [
          { value: 'Video', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.relation.uri': [
          { value: 'https://example.com/video1', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect((c as unknown as { getBitstreamsToAdd(): File[] }).getBitstreamsToAdd()).toEqual([]);
    expect((c as unknown as { getBitstreamsToRemove(): string[] }).getBitstreamsToRemove()).toEqual([]);
  });

  /**
   * Verifica que en edit Video con URL modificada los hooks pidan: subir un
   * .txt nuevo con la URL al ORIGINAL y borrar el uuid del marcador previo.
   */
  it('should add a new marker file and remove the previous uuid when the Video URL changes in edit mode', () => {
    listOriginalFn.mockReturnValue(
      of({
        items: [{ uuid: 'marker-uuid', name: '_video_link.txt', sizeBytes: 30 }],
        totalElements: 1,
        totalPages: 1,
        size: 1,
        page: 0,
      }),
    );
    const item: Item = {
      uuid: 'item-vid',
      name: 'Charla',
      handle: '123/9',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.type': [
          { value: 'Video', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'dc.relation.uri': [
          { value: 'https://example.com/video1', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({ relationUri: 'https://example.com/video2' });

    const adds = (c as unknown as { getBitstreamsToAdd(): File[] }).getBitstreamsToAdd();
    expect(adds.length).toBe(1);
    expect(adds[0].name).toBe('_video_link.txt');
    expect((c as unknown as { getBitstreamsToRemove(): string[] }).getBitstreamsToRemove()).toEqual(['marker-uuid']);
  });

  /** Verifica que al entrar a edit con un Documento no-Video se pida la primera página del bundle ORIGINAL. */
  it('should fetch the first page of ORIGINAL bitstreams when entering edit mode for a non-Video document', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Manual',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.type': [
          { value: 'Manual', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(listOriginalFn).toHaveBeenCalledWith('item-1', 0, 20);
  });

  /** Verifica que un Date en `issued` se serialice como YYYY-MM-DD local en buildPatchFromForm. */
  it('should serialize a Date in issued as local YYYY-MM-DD in buildPatchFromForm', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Manual',
      handle: '123/1',
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

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: 'PEAC' });
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

  /**
   * Verifica que agregar una palabra clave anexe con `/-` en vez de reemplazar el campo.
   * DSpace acepta con 200 el remove del campo entero + add array pero no lo persiste.
   */
  it('should append a new keyword by index instead of removing and re-adding the whole subject field', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Manual',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.subject': [
          { value: 'Requisitos', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: 'PEAC' });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({ subject: 'Requisitos, Nuevos' });
    const patch = c.buildPatchFromForm(item);

    expect(patch).toContainEqual({
      op: 'add',
      path: '/metadata/dc.subject/-',
      value: { value: 'Nuevos' },
    });
    expect(patch).not.toContainEqual({ op: 'remove', path: '/metadata/dc.subject' });
  });

  /** Verifica que el autor elegido (nombre de subdirección) caiga en dc.contributor.author. */
  it('should map the selected subdirección name to dc.contributor.author', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({ author: 'Subdirección de Educación Básica' });

    expect(c.buildMetadata()['dc.contributor.author']?.[0]?.value).toBe(
      'Subdirección de Educación Básica',
    );
  });

  /** Verifica que un autor tecleado fuera de la lista (texto libre) se guarde tal cual. */
  it('should keep a free-typed author verbatim in dc.contributor.author', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.patchValue({ author: 'Comisión Ad-hoc 2026' });

    expect(c.buildMetadata()['dc.contributor.author']?.[0]?.value).toBe('Comisión Ad-hoc 2026');
  });

  /** Verifica que al crear el publisher venga prellenado con la institución. */
  it('should prefill dc.publisher with the institution on create', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.controls.publisher.value).toBe('DIGEEX, MINEDUC');
    expect(c.buildMetadata()['dc.publisher']?.[0]?.value).toBe('DIGEEX, MINEDUC');
  });

  /** Verifica que al editar el publisher cargue el guardado y el default no lo pise. */
  it('should load the stored publisher on edit without clobbering it with the default', () => {
    const item: Item = {
      uuid: 'item-1',
      name: 'Doc',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.publisher': [
          { value: 'Editorial Distinta', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: 'PEAC' });
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.publisher.value).toBe('Editorial Distinta');
  });

  /** Verifica que las opciones de subdirección se armen con los nombres de las subcomunidades de la raíz. */
  it('should load subdirección options from the root subcommunity names', () => {
    listSubsFn.mockReturnValue(
      of([
        { uuid: 's1', name: 'Subdirección de Educación Extraescolar', handle: '', type: 'community', metadata: {} },
        { uuid: 's2', name: 'Subdirección de Educación Básica', handle: '', type: 'community', metadata: {} },
      ]),
    );
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.subdireccionOptions()).toEqual([
      'Subdirección de Educación Básica',
      'Subdirección de Educación Extraescolar',
    ]);
  });
});
