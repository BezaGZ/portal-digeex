import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { Subject, of } from 'rxjs';

import { DocumentSubmissionForm } from './document-submission-form';
import { Collection } from '../../../../../core/api/models/collection.model';
import { SubmissionFacade } from '../../../content/services/submission-facade';
import { VocabularyApiService } from '../../../../../core/api/vocabulary-api.service';
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

  let getEntriesFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getEntriesFn = vi.fn().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [DocumentSubmissionForm],
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

  /** Verifica que el form declare digeex-documento como section name de la submission. */
  it('should declare digeex-documento as the submission section name', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.getSectionName()).toBe('digeex-documento');
  });

  /** Verifica que la visibilidad arranque en public y refleje cambios de la signal. */
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

  /** Verifica que getFiles exponga el contenido de la signal files. */
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

  /** Verifica que buildMetadata mapee cada campo del form a su clave dc.* correspondiente. */
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
    expect(metadata['dc.audience']?.[0]?.value).toBe('Primaria');
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    getEntriesFn.mockImplementation((name: string) => {
      if (name === 'tipos-documento') return tipos$;
      if (name === 'niveles-educativos') return niveles$;
      if (name === 'idiomas-digeex') return idiomas$;
      return of([]);
    });

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    expect(getEntriesFn).toHaveBeenCalledWith('tipos-documento');
    expect(getEntriesFn).toHaveBeenCalledWith('niveles-educativos');
    expect(getEntriesFn).toHaveBeenCalledWith('idiomas-digeex');
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
    getEntriesFn.mockImplementation((name: string) => {
      if (name === 'tipos-documento') return of(tipos);
      if (name === 'niveles-educativos') return of(niveles);
      return of([]);
    });

    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.tipoDocumentoOptions()).toEqual(tipos);
    expect(c.audienceOptions()).toEqual(niveles);
  });

  /** Verifica que el form quede inválido si el título está vacío. */
  it('should mark the form invalid when title is empty', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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
    // Vacío no debe persistir; DSpace recibiría una entry con value="" si no
    // se filtra, ensuciando el item con metadata sin sentido.
    expect(metadata['dc.publisher']).toBeUndefined();
  });

  /** Verifica que acceptedFileTypes cubra los formatos ofimáticos esperados (Word, Excel, PowerPoint, ODF, plain text). */
  it('should expose acceptedFileTypes covering office formats', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // Lista canonica de formatos ofimaticos permitidos (Word, Excel, PowerPoint,
    // OpenDocument, plain text). dc.format en DSpace queda libre porque el
    // bitstream registry detecta el mimetype al subir.
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
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
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

  /** Verifica que getCoverFile exponga el cover seleccionado y devuelva null en modo Video. */
  it('should expose the selected cover file via getCoverFile and return null in video mode', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.getCoverFile()).toBeNull();

    const cover = new File([''], 'portada.jpg', { type: 'image/jpeg' });
    c.onCoverChange([cover]);
    expect(c.getCoverFile()).toBe(cover);

    // Modo Video descarta la portada para que el facade no intente subir
    // un thumbnail al item del video externo.
    c.form.patchValue({ isVideo: true });
    expect(c.getCoverFile()).toBeNull();
  });

  /** Verifica que acceptedFileTypes se aplique al input nativo del p-fileupload del formulario. */
  it('should bind acceptedFileTypes to the document p-fileupload accept input', () => {
    const fixture = TestBed.createComponent(DocumentSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // PrimeNG aplica el accept al <input type="file"> interno del fileupload.
    // Buscamos ese input y verificamos que su accept coincide con la propiedad
    // del componente y contiene un formato de la lista ampliada (no es solo
    // un undefined === undefined que pase por accidente).
    const nativeInput = fixture.nativeElement.querySelector(
      'p-fileupload input[type="file"]',
    ) as HTMLInputElement | null;
    expect(nativeInput).not.toBeNull();
    expect(nativeInput!.accept).toBe(c.acceptedFileTypes);
    expect(nativeInput!.accept).toContain('.xlsx');
  });
});
