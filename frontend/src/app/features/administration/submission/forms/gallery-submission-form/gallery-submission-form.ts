import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { Select } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';

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
import { FileDropzoneComponent } from '../../../../../shared';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';
import { BitstreamBundleManagerComponent } from '../../../../../shared/components/bitstream-bundle-manager/bitstream-bundle-manager.component';

/**
 * Formulario de submission para colecciones de tipo Galería. Persiste un
 * álbum de fotos (multi-bitstream) con metadata de programa, tipo de
 * población y enfoque de imagen.
 */
@Component({
  selector: 'app-gallery-submission-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gallery-submission-form.html',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CardModule,
    InputTextModule,
    TextareaModule,
    Select,
    DatePickerModule,
    ToggleSwitchModule,
    ButtonModule,
    FileDropzoneComponent,
    LoadingSpinnerComponent,
    BitstreamBundleManagerComponent,
  ],
})
export class GallerySubmissionForm extends BaseSubmissionForm {
  private readonly fb = inject(FormBuilder);
  private readonly vocabApi = inject(VocabularyApiService);

  readonly visibility = signal<'public' | 'private'>('public');

  /** Multi-bitstream: cada foto del álbum llega al bundle ORIGINAL del workspaceitem. */
  readonly files = signal<File[]>([]);

  /** Imagen de portada que el facade coloca en el bundle THUMBNAIL post-archive. Required en Galería. */
  readonly coverFile = signal<File | null>(null);

  /** Página visible de fotos del bundle ORIGINAL en edit; se mueve con el paginator. */
  readonly currentBitstreams = signal<Bitstream[]>([]);
  readonly currentBitstreamsTotal = signal(0);
  readonly currentBitstreamsPage = signal(0);
  readonly currentBitstreamsSize = signal(20);

  /** UUIDs marcados para borrar; persisten al cambiar de página y se aplican en Submit. */
  readonly pendingDeletes = signal<ReadonlySet<string>>(new Set());

  /** Archivos nuevos en la pila de "subir al ORIGINAL" del próximo Submit. */
  readonly pendingAdds = signal<File[]>([]);

  private readonly destroyRef = inject(DestroyRef);

  /**
   * Form de los campos del schema digeex-galeria. Required: title, issued,
   * type (vocabulario tipos-evento) y classification (vocabulario
   * programas-digeex). Lo demas es opcional segun el JSON oficial del
   * submissionform.
   */
  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(200)]],
    abstract: ['', [Validators.maxLength(1000)]],
    type: ['', [Validators.required]],
    issued: ['', [Validators.required]],
    author: [''],
    classification: ['', [Validators.required]],
    populationType: [''],
    imageFocus: [''],
  });

  /** Entries del dropdown "Tipo de evento" (vocabulario tipos-evento). */
  readonly tiposEventoOptions = signal<VocabularyEntry[]>([]);

  /** Entries del dropdown "Programa" (vocabulario programas-digeex). */
  readonly programasOptions = signal<VocabularyEntry[]>([]);

  /** Entries del dropdown "Tipo de población" (vocabulario tipo-poblacion). */
  readonly tipoPoblacionOptions = signal<VocabularyEntry[]>([]);

  /** Entries del dropdown "Enfoque visual" (vocabulario enfoque-imagen). */
  readonly enfoqueImagenOptions = signal<VocabularyEntry[]>([]);

  /**
   * True hasta que los cuatro vocabularios respondieron. El template lo bindea
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
   * Habilita el botón Submit. Galería requiere form válido, al menos una
   * foto en el bundle ORIGINAL y una portada explícita en modo creación.
   * En modo edición basta con el form válido (los bitstreams se gestionan
   * en el ciclo siguiente).
   */
  readonly canSubmit = computed(() => {
    if (this.formStatus() !== 'VALID') return false;
    if (this.isEditMode()) {
      const effective =
        this.currentBitstreamsTotal() -
        this.pendingDeletes().size +
        this.pendingAdds().length;
      return effective > 0;
    }
    if (this.files().length === 0) return false;
    return this.coverFile() !== null;
  });

  constructor() {
    super();
    /**
     * Carga paralela de los cuatro vocabularios. forkJoin emite cuando todos
     * completan, así con un solo subscribe sabemos que el form ya está
     * armado y podemos bajar el flag del spinner.
     */
    forkJoin({
      tipos: this.vocabApi.getEntries('tipos-evento'),
      programas: this.vocabApi.getEntries('programas-digeex'),
      poblacion: this.vocabApi.getEntries('tipo-poblacion'),
      enfoque: this.vocabApi.getEntries('enfoque-imagen'),
    }).subscribe(({ tipos, programas, poblacion, enfoque }) => {
      this.tiposEventoOptions.set(tipos);
      this.programasOptions.set(programas);
      this.tipoPoblacionOptions.set(poblacion);
      this.enfoqueImagenOptions.set(enfoque);
      this.vocabulariesLoading.set(false);
    });
  }

  override getSectionName(): string {
    return 'digeex-galeria';
  }

  override buildMetadata(): Record<string, MetadataValue[]> {
    const v = this.form.getRawValue();
    const md: Record<string, MetadataValue[]> = {
      'dc.title': [mv(v.title)],
      'dc.type': [mv(v.type)],
      'dc.date.issued': [mv(toLocalIsoDate(v.issued))],
      'dc.subject.classification': [mv(v.classification)],
    };
    if (v.abstract.trim().length > 0) md['dc.description.abstract'] = [mv(v.abstract.trim())];
    if (v.author.trim().length > 0) md['dc.contributor.author'] = [mv(v.author.trim())];
    if (v.populationType.length > 0) md['digeex.populationType'] = [mv(v.populationType)];
    if (v.imageFocus.length > 0) md['digeex.imageFocus'] = [mv(v.imageFocus)];
    return md;
  }

  override getFiles(): File[] {
    return this.files();
  }

  override getVisibility(): 'public' | 'private' {
    return this.visibility();
  }

  /**
   * Portada del álbum: el usuario sube una imagen específica que el facade
   * coloca en el bundle THUMBNAIL post-archive. A diferencia de Documento,
   * en Galería es required: sin portada un álbum se vería con placeholder
   * gris en el listado y el detail.
   */
  override getCoverFile(): File | null {
    return this.coverFile();
  }

  /**
   * Tras un submit exitoso volvemos al estado inicial para que el usuario
   * pueda armar otro álbum en el mismo programa sin recargar. Resetea form,
   * fotos y visibilidad; deja la collection seleccionada.
   * En modo edición el reset no aplica: la base navega a Mis envíos.
   */
  protected override afterSuccess(): void {
    if (this.isEditMode()) return;
    this.form.reset({
      title: '',
      abstract: '',
      type: '',
      issued: '',
      author: '',
      classification: '',
      populationType: '',
      imageFocus: '',
    });
    this.files.set([]);
    this.coverFile.set(null);
    this.visibility.set('public');
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }

  /** Selección de fotos desde el app-file-dropzone (multiple, image/*). */
  onFilesChange(files: File[]): void {
    this.files.set(files);
  }

  /** Selección de la portada desde el app-file-dropzone (single, image/*). */
  onCoverChange(files: File[]): void {
    this.coverFile.set(files[0] ?? null);
  }

  /** Vuelve al listado de programas en creación, o a Mis envíos en edición. */
  cancel(): void {
    const target = this.isEditMode()
      ? ['/administrador/envios']
      : ['/administrador/cargar'];
    this.router.navigate(target);
  }

  /** Pre-llena el form desde la metadata del item. Los dropdowns conservan el stored value. */
  override applyItemToForm(item: Item): void {
    const m = item.metadata;
    const first = (k: string): string => m?.[k]?.[0]?.value ?? '';
    this.form.patchValue({
      title: first('dc.title'),
      abstract: first('dc.description.abstract'),
      type: first('dc.type'),
      issued: first('dc.date.issued'),
      author: first('dc.contributor.author'),
      classification: first('dc.subject.classification'),
      populationType: first('digeex.populationType'),
      imageFocus: first('digeex.imageFocus'),
    });
    this.visibility.set(item.discoverable ? 'public' : 'private');
    this.loadOriginalBitstreams(item.uuid, 0, this.currentBitstreamsSize());
  }

  /**
   * Handler del `<p-paginator>` de la sección Fotos actuales. El widget emite
   * page como índice 0-based y rows como tamaño elegido en el selector.
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

  /**
   * Reemplaza la pila de subida con la lista completa que emite el dropzone.
   * El dropzone es la única fuente: agregar o quitar archivos reemite su lista
   * actual, así no quedan duplicados ni estado paralelo desincronizado.
   */
  onAddBitstreams(files: File[]): void {
    this.pendingAdds.set([...files]);
  }

  protected override getBitstreamsToRemove(): string[] {
    return Array.from(this.pendingDeletes());
  }

  protected override getBitstreamsToAdd(): File[] {
    return this.pendingAdds();
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

  /** Diff form vs metadata original del item; emite el JSON Patch mínimo. */
  override buildPatchFromForm(item: Item): JsonPatchEntry[] {
    const v = this.form.getRawValue();
    const scalarFields: Record<string, string> = {
      'dc.title': v.title,
      'dc.description.abstract': v.abstract,
      'dc.type': v.type,
      'dc.date.issued': toLocalIsoDate(v.issued),
      'dc.contributor.author': v.author,
      'dc.subject.classification': v.classification,
      'digeex.populationType': v.populationType,
      'digeex.imageFocus': v.imageFocus,
    };
    return buildMetadataPatch(scalarFields, item.metadata ?? {});
  }
}

registerSubmissionForm('Galeria', GallerySubmissionForm);
