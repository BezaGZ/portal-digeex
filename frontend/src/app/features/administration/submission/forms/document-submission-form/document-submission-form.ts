import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { Select } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { FileUploadModule } from 'primeng/fileupload';
import { PaginatorModule } from 'primeng/paginator';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { FileDropzoneComponent } from '../../../../../shared';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';
import { BaseSubmissionForm } from '../../base-submission-form';
import { registerSubmissionForm } from '../../submission-form-registry';
import { mv } from '../../metadata-value.util';
import { buildMetadataPatch } from '../../metadata-patch.util';
import { toLocalIsoDate } from '../../../../../core/i18n/iso-date.util';
import { MetadataValue } from '../../../../../core/api/models/metadata.model';
import { Bitstream } from '../../../../../core/api/models/bitstream.model';
import { Item } from '../../../../../core/api/models/item.model';
import { JsonPatchEntry } from '../../../../../core/api/json-patch.util';
import { VocabularyApiService } from '../../../../../core/api/vocabulary-api.service';
import { VocabularyEntry } from '../../../../../core/api/models/vocabulary-entry.model';

/**
 * Formulario de submission para colecciones de tipo Documento. Extiende
 * la base con los campos del schema digeex-documento y un toggle "video
 * externo" que cuando se activa cambia el comportamiento a guardar URL
 * en lugar de PDF (cubre F-03 y F-06 con un solo componente).
 */
@Component({
  selector: 'app-document-submission-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-submission-form.html',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CardModule,
    InputTextModule,
    TextareaModule,
    Select,
    DatePickerModule,
    FileUploadModule,
    PaginatorModule,
    ToggleSwitchModule,
    ButtonModule,
    MessageModule,
    FileDropzoneComponent,
    LoadingSpinnerComponent,
    DecimalPipe,
  ],
})
export class DocumentSubmissionForm extends BaseSubmissionForm {
  private readonly fb = inject(FormBuilder);
  private readonly vocabApi = inject(VocabularyApiService);

  /** Lo bindeará un toggle del template; default público para el caso común. */
  readonly visibility = signal<'public' | 'private'>('public');

  /** Bitstreams seleccionados por el `<p-fileUpload>` del template. */
  readonly files = signal<File[]>([]);

  /** Imagen opcional de portada que el facade pondrá en el bundle THUMBNAIL. */
  readonly coverFile = signal<File | null>(null);

  /** Página visible de bitstreams del bundle ORIGINAL; se llena al entrar a edit y al cambiar de página. */
  readonly currentBitstreams = signal<Bitstream[]>([]);
  readonly currentBitstreamsTotal = signal(0);
  readonly currentBitstreamsPage = signal(0);
  readonly currentBitstreamsSize = signal(20);

  /**
   * UUIDs marcados para borrar; viven aparte de la lista paginada para que el
   * estado sobreviva al cambiar de página. El borrado real ocurre recién en
   * el Submit (`getBitstreamsToRemove`); hasta entonces es un toggle visual.
   */
  readonly pendingDeletes = signal<ReadonlySet<string>>(new Set());

  /** Archivos nuevos en la pila de "subir al ORIGINAL" del próximo Submit. */
  readonly pendingAdds = signal<File[]>([]);

  private readonly destroyRef = inject(DestroyRef);

  /**
   * Lista canonica de formatos ofimaticos que acepta el bitstream principal
   * del item. Cubre PDF, Word, Excel, PowerPoint, OpenDocument y plain text.
   * Si aparece otro formato comun en el futuro (Pages, Numbers, etc.) se
   * agrega aqui y el template lo refleja via [accept].
   */
  readonly acceptedFileTypes =
    '.pdf,.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp';

  /** Form de los campos del schema digeex-documento. `isVideo` es el toggle. */
  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(200)]],
    abstract: ['', [Validators.required, Validators.maxLength(1000)]],
    type: [''],
    audience: [''],
    issued: ['', [Validators.required]],
    author: [''],
    publisher: [''],
    subject: [''],
    language: [''],
    relationUri: [''],
    isVideo: false,
  });

  /** Entradas del dropdown de tipo de documento (vocabulario tipos-documento). */
  readonly tipoDocumentoOptions = signal<VocabularyEntry[]>([]);

  /** Entradas del dropdown de nivel educativo (vocabulario niveles-educativos). */
  readonly audienceOptions = signal<VocabularyEntry[]>([]);

  /** Entradas del dropdown de idioma (vocabulario idiomas-digeex). */
  readonly idiomaOptions = signal<VocabularyEntry[]>([]);

  /**
   * True hasta que los tres vocabularios respondieron. El template lo bindea
   * a `<app-loading-spinner>` para evitar mostrar dropdowns vacíos durante el
   * vuelo de las requests.
   */
  readonly vocabulariesLoading = signal(true);

  /** Estado del form como signal — los validators reactivos lo emiten en cada cambio. */
  private readonly formStatus = toSignal(
    this.form.statusChanges.pipe(startWith(this.form.status), takeUntilDestroyed()),
    { initialValue: this.form.status },
  );

  /**
   * Habilita el botón Submit. Combina la validez del FormGroup con la regla
   * de archivo: en modo Documento se requiere al menos un PDF; en modo Video
   * la URL reemplaza al archivo y no se exige bitstream. En modo edición no
   * se piden archivos (los bitstreams se gestionan en el ciclo siguiente),
   * basta con que el form sea válido.
   */
  readonly canSubmit = computed(() => {
    if (this.formStatus() !== 'VALID') return false;
    if (this.isEditMode()) {
      // En modo Video el ORIGINAL es un .txt marcador autogenerado: no se
      // gestiona manualmente, así que no aplicamos el check de archivos.
      if (this.form.controls.isVideo.value) return true;
      const effective =
        this.currentBitstreamsTotal() -
        this.pendingDeletes().size +
        this.pendingAdds().length;
      return effective > 0;
    }
    const isVideo = this.form.controls.isVideo.value;
    if (!isVideo && this.files().length === 0) return false;
    return true;
  });

  constructor() {
    super();
    /**
     * Carga paralela de los tres vocabularios. forkJoin emite cuando todos
     * completan, así con un solo subscribe sabemos que el form ya está
     * armado y podemos bajar el flag del spinner.
     */
    forkJoin({
      tipos: this.vocabApi.getEntries('tipos-documento'),
      niveles: this.vocabApi.getEntries('niveles-educativos'),
      idiomas: this.vocabApi.getEntries('idiomas-digeex'),
    }).subscribe(({ tipos, niveles, idiomas }) => {
      this.tipoDocumentoOptions.set(tipos);
      this.audienceOptions.set(niveles);
      this.idiomaOptions.set(idiomas);
      this.vocabulariesLoading.set(false);
    });

    this.form.controls.isVideo.valueChanges
      .pipe(startWith(this.form.controls.isVideo.value), takeUntilDestroyed())
      .subscribe((isVideo) => this.applyConditionalValidators(isVideo));
  }

  private applyConditionalValidators(isVideo: boolean): void {
    const typeCtrl = this.form.controls.type;
    const audienceCtrl = this.form.controls.audience;
    const relationCtrl = this.form.controls.relationUri;

    if (isVideo) {
      typeCtrl.clearValidators();
      audienceCtrl.clearValidators();
      relationCtrl.setValidators([
        Validators.required,
        Validators.pattern(/^https?:\/\/.+/),
      ]);
    } else {
      typeCtrl.setValidators([Validators.required]);
      audienceCtrl.setValidators([Validators.required]);
      relationCtrl.clearValidators();
    }
    typeCtrl.updateValueAndValidity({ emitEvent: false });
    audienceCtrl.updateValueAndValidity({ emitEvent: false });
    relationCtrl.updateValueAndValidity({ emitEvent: false });
  }

  override getSectionName(): string {
    return 'digeex-documento';
  }

  override buildMetadata(): Record<string, MetadataValue[]> {
    const v = this.form.getRawValue();
    /**
     * dc.subject es repeatable en DSpace: cada keyword va como una entrada
     * separada del array. Partimos el string por coma y descartamos vacíos
     * para que palabras compuestas tipo "educación de adultos" sigan siendo
     * un solo keyword si el usuario no las separó.
     */
    const subjects = v.subject
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(mv);

    const md: Record<string, MetadataValue[]> = {
      'dc.title': [mv(v.title)],
      'dc.description.abstract': [mv(v.abstract)],
      'dc.type': [mv(v.isVideo ? 'Video' : v.type)],
      'dc.audience': [mv(v.audience)],
      'dc.date.issued': [mv(toLocalIsoDate(v.issued))],
      'dc.contributor.author': [mv(v.author)],
      'dc.subject': subjects,
      'dc.language.iso': [mv(v.language)],
    };
    if (v.publisher.trim().length > 0) {
      md['dc.publisher'] = [mv(v.publisher.trim())];
    }
    if (v.isVideo) {
      md['dc.relation.uri'] = [mv(v.relationUri)];
    }
    return md;
  }

  /** Nombre del bitstream "marcador" que se sube al ORIGINAL en modo Video. */
  static readonly VIDEO_LINK_BITSTREAM_NAME = '_video_link.txt';

  override getFiles(): File[] {
    if (this.form.controls.isVideo.value) {
      // El step `upload` de DSpace exige al menos un bitstream para commitear.
      // Subimos un .txt con la URL como marcador; la URL real vive en dc.relation.uri
      // y el detail oculta este bitstream del listado de archivos descargables.
      const url = this.form.controls.relationUri.value;
      if (!url) return [];
      return [
        new File([url], DocumentSubmissionForm.VIDEO_LINK_BITSTREAM_NAME, {
          type: 'text/plain',
        }),
      ];
    }
    return this.files();
  }

  override getVisibility(): 'public' | 'private' {
    return this.visibility();
  }

  override getCoverFile(): File | null {
    // Portada opcional en ambos modos; en video reemplaza al thumbnail
    // autogenerado por DSpace (que no aplica a un bitstream marcador .txt).
    return this.coverFile();
  }

  /**
   * Tras un submit exitoso volvemos al estado inicial para que el usuario
   * pueda subir otro item al mismo programa sin recargar la pantalla.
   * Resetea form, archivos, portada y visibilidad; deja isVideo en false
   * (modo Documento por default) y vuelve a la collection seleccionada.
   * En modo edición el reset no aplica: la base navega a Mis envíos.
   */
  protected override afterSuccess(): void {
    if (this.isEditMode()) return;
    this.form.reset({
      title: '',
      abstract: '',
      type: '',
      audience: '',
      issued: '',
      author: '',
      publisher: '',
      subject: '',
      language: '',
      relationUri: '',
      isVideo: false,
    });
    this.files.set([]);
    this.coverFile.set(null);
    this.visibility.set('public');
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }

  /** Selección de la portada desde el app-file-dropzone (single, image/*). */
  onCoverChange(files: File[]): void {
    this.coverFile.set(files[0] ?? null);
  }

  /** `(filesChange)` del app-file-dropzone emite la lista actual completa. */
  onFilesChange(files: File[]): void {
    this.files.set(files);
  }

  /** Vuelve al listado de programas en creación, o a Mis envíos en edición. */
  cancel(): void {
    const target = this.isEditMode()
      ? ['/administrador/envios']
      : ['/administrador/cargar'];
    this.router.navigate(target);
  }

  /**
   * Pre-llena el form con los valores actuales del item. Los dropdowns
   * conservan el stored value (e.g. `acr` para idioma) que es lo que DSpace
   * almacena en `dc.*`; el label visible se resuelve por la opción del select.
   */
  override applyItemToForm(item: Item): void {
    const m = item.metadata;
    const first = (k: string): string => m?.[k]?.[0]?.value ?? '';
    const subjects = (m?.['dc.subject'] ?? []).map((v) => v.value).filter((s) => !!s).join(', ');
    this.form.patchValue({
      title: first('dc.title'),
      abstract: first('dc.description.abstract'),
      type: first('dc.type'),
      audience: first('dc.audience'),
      issued: first('dc.date.issued'),
      author: first('dc.contributor.author'),
      publisher: first('dc.publisher'),
      subject: subjects,
      language: first('dc.language.iso'),
      relationUri: first('dc.relation.uri'),
      isVideo: first('dc.type') === 'Video',
    });
    // El toggle visible se sincroniza con el flag nativo del item.
    this.visibility.set(item.discoverable ? 'public' : 'private');
    this.form.controls.isVideo.disable({ emitEvent: false });

    const isVideo = first('dc.type') === 'Video';
    if (isVideo) {
      // En Video pedimos un solo bitstream del ORIGINAL para capturar el uuid
      // del marcador `_video_link.txt`; si el usuario cambia la URL después,
      // los hooks emitirán remove(uuid) + add(.txt nuevo).
      this.itemFacade
        .listOriginalBitstreams$(item.uuid, 0, 1)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((p) => {
          this.videoLinkBitstreamUuid = p.items[0]?.uuid ?? null;
        });
    } else {
      this.loadOriginalBitstreams(item.uuid, 0, this.currentBitstreamsSize());
    }
  }

  /** UUID del bitstream marcador en modo Video; se captura al entrar a edit. */
  private videoLinkBitstreamUuid: string | null = null;

  /**
   * Handler del `<p-paginator>` de la sección Archivos actuales. El widget
   * emite page como índice 0-based y rows como tamaño elegido en el selector.
   */
  onBitstreamPageChange(ev: { page?: number; rows?: number | null }): void {
    const item = this.item();
    if (!item) return;
    const page = ev.page ?? 0;
    const size = ev.rows ?? this.currentBitstreamsSize();
    this.loadOriginalBitstreams(item.uuid, page, size);
  }

  /** Toggle del set de marcados para borrar; el template lo invoca por fila. */
  togglePendingDelete(uuid: string): void {
    const next = new Set(this.pendingDeletes());
    if (next.has(uuid)) {
      next.delete(uuid);
    } else {
      next.add(uuid);
    }
    this.pendingDeletes.set(next);
  }

  /** True si el uuid está marcado para borrar; el template lo usa para el strikethrough. */
  isPendingDelete(uuid: string): boolean {
    return this.pendingDeletes().has(uuid);
  }

  /** Suma archivos a la pila de subida; recibe el array completo del dropzone. */
  onAddBitstreams(files: File[]): void {
    this.pendingAdds.set([...this.pendingAdds(), ...files]);
  }

  /** Quita un archivo de la pila de subida antes de confirmar el Submit. */
  removePendingAdd(file: File): void {
    this.pendingAdds.set(this.pendingAdds().filter((f) => f !== file));
  }

  protected override getBitstreamsToRemove(): string[] {
    if (this.isEditMode() && this.form.controls.isVideo.value) {
      // En Video el "borrado" solo aplica cuando la URL cambió: hay que dejar
      // el .txt actual fuera para que el nuevo lo reemplace.
      return this.videoUrlChanged() && this.videoLinkBitstreamUuid
        ? [this.videoLinkBitstreamUuid]
        : [];
    }
    return Array.from(this.pendingDeletes());
  }

  protected override getBitstreamsToAdd(): File[] {
    if (this.isEditMode() && this.form.controls.isVideo.value) {
      // Si la URL cambió, regeneramos el `_video_link.txt` para mantener el
      // bitstream del ORIGINAL alineado con `dc.relation.uri`.
      if (!this.videoUrlChanged()) return [];
      const newUri = this.form.controls.relationUri.value;
      return [
        new File([newUri], DocumentSubmissionForm.VIDEO_LINK_BITSTREAM_NAME, {
          type: 'text/plain',
        }),
      ];
    }
    return this.pendingAdds();
  }

  /** True si el form tiene una URL distinta a la del item (modo Video, edit). */
  private videoUrlChanged(): boolean {
    const item = this.item();
    if (!item) return false;
    const original = item.metadata?.['dc.relation.uri']?.[0]?.value ?? '';
    const current = this.form.controls.relationUri.value ?? '';
    return current.length > 0 && current !== original;
  }

  /** Pide al facade una página del bundle ORIGINAL y llena las signals visibles. */
  private loadOriginalBitstreams(itemUuid: string, page: number, size: number): void {
    this.itemFacade
      .listOriginalBitstreams$(itemUuid, page, size)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((paginated) => {
        this.currentBitstreams.set(paginated.items);
        this.currentBitstreamsTotal.set(paginated.totalElements);
        this.currentBitstreamsPage.set(paginated.page);
        this.currentBitstreamsSize.set(paginated.size);
      });
  }

  /**
   * Construye el JSON Patch contra la metadata original del item. dc.subject
   * se trata aparte: es repeatable, así que cuando el usuario cambió la lista
   * separada por comas reemplazamos el campo completo (remove + add); si la
   * lista coincide con la original no emitimos op.
   */
  override buildPatchFromForm(item: Item): JsonPatchEntry[] {
    const v = this.form.getRawValue();
    const subjectsNew = v.subject
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const scalarFields: Record<string, string> = {
      'dc.title': v.title,
      'dc.description.abstract': v.abstract,
      'dc.type': v.isVideo ? 'Video' : v.type,
      'dc.audience': v.audience,
      'dc.date.issued': toLocalIsoDate(v.issued),
      'dc.contributor.author': v.author,
      'dc.publisher': v.publisher,
      'dc.language.iso': v.language,
      'dc.relation.uri': v.isVideo ? v.relationUri : '',
    };

    const ops = buildMetadataPatch(scalarFields, item.metadata ?? {});

    const subjectsOld = (item.metadata?.['dc.subject'] ?? []).map((x) => x.value);
    const sameSubjects =
      subjectsOld.length === subjectsNew.length &&
      subjectsOld.every((s, i) => s === subjectsNew[i]);
    if (!sameSubjects) {
      if (subjectsOld.length > 0) {
        ops.push({ op: 'remove', path: '/metadata/dc.subject' });
      }
      if (subjectsNew.length > 0) {
        ops.push({
          op: 'add',
          path: '/metadata/dc.subject',
          value: subjectsNew.map((s) => ({ value: s })),
        });
      }
    }

    return ops;
  }
}

registerSubmissionForm('Documento', DocumentSubmissionForm);
