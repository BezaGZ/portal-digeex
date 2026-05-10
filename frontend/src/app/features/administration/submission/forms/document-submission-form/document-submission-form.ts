import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { FileDropzoneComponent } from '../../../../../shared';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';
import { BaseSubmissionForm } from '../../base-submission-form';
import { registerSubmissionForm } from '../../submission-form-registry';
import { mv } from '../../metadata-value.util';
import { MetadataValue } from '../../../../../core/api/models/metadata.model';
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
    ToggleSwitchModule,
    ButtonModule,
    MessageModule,
    FileDropzoneComponent,
    LoadingSpinnerComponent,
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
   * la URL reemplaza al archivo y no se exige bitstream.
   */
  readonly canSubmit = computed(() => {
    if (this.formStatus() !== 'VALID') return false;
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
      'dc.date.issued': [mv(v.issued)],
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

  override getFiles(): File[] {
    if (this.form.controls.isVideo.value) return [];
    return this.files();
  }

  override getVisibility(): 'public' | 'private' {
    return this.visibility();
  }

  override getCoverFile(): File | null {
    if (this.form.controls.isVideo.value) return null;
    return this.coverFile();
  }

  /**
   * Tras un submit exitoso volvemos al estado inicial para que el usuario
   * pueda subir otro item al mismo programa sin recargar la pantalla.
   * Resetea form, archivos, portada y visibilidad; deja isVideo en false
   * (modo Documento por default) y vuelve a la collection seleccionada.
   */
  protected override afterSuccess(): void {
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

  /** Vuelve al listado de programas; descarta cualquier dato sin enviar. */
  cancel(): void {
    this.router.navigate(['/administrador/cargar']);
  }
}

registerSubmissionForm('Documento', DocumentSubmissionForm);
