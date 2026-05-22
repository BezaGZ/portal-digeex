import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs/operators';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { Select } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
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
import { Item } from '../../../../../core/api/models/item.model';
import { JsonPatchEntry } from '../../../../../core/api/json-patch.util';
import { VocabularyApiService } from '../../../../../core/api/vocabulary-api.service';
import { VocabularyEntry } from '../../../../../core/api/models/vocabulary-entry.model';

/**
 * Formulario de submission para colecciones de tipo Estadística. Extiende
 * `BaseSubmissionForm` con cuatro campos del schema digeex-estadistica
 * (`dc.title`, `dc.description.abstract`, `dc.date.issued`, `digeex.statsDataset`)
 * más un dropzone de un único `.xlsx`. El dropdown de Dataset se puebla con
 * el vocabulario controlado `tipos-dataset-estadistica` y define qué
 * `StatsRenderer` monta la vista pública del item archivado. Patrón
 * Template Method ya canonizado por la base; este subform agrega su
 * comportamiento por override de los hooks abstractos.
 */
@Component({
  selector: 'app-stats-submission-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats-submission-form.html',
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
    MessageModule,
    FileDropzoneComponent,
    LoadingSpinnerComponent,
  ],
})
export class StatsSubmissionForm extends BaseSubmissionForm {
  private readonly fb = inject(FormBuilder);
  private readonly vocabApi = inject(VocabularyApiService);

  /** Toggle Pública/Privada que controla `discoverable` post-archive. */
  readonly visibility = signal<'public' | 'private'>('public');

  /** Bitstream Excel: un único archivo por item, seleccionado vía `<app-file-dropzone>`. */
  readonly files = signal<File[]>([]);

  /** Entradas del dropdown de Dataset (vocabulario `tipos-dataset-estadistica`). */
  readonly datasetOptions = signal<VocabularyEntry[]>([]);

  /**
   * True hasta que el vocabulario respondió. El template lo bindea a
   * `<app-loading-spinner>` para evitar mostrar el dropdown vacío durante
   * el vuelo de la request.
   */
  readonly vocabulariesLoading = signal(true);

  /** Form de los cuatro campos del schema digeex-estadistica. */
  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(200)]],
    abstract: ['', [Validators.maxLength(1000)]],
    issued: ['', [Validators.required]],
    dataset: ['', [Validators.required]],
  });

  /** Estado del form como signal; los validators reactivos lo emiten en cada cambio. */
  private readonly formStatus = toSignal(
    this.form.statusChanges.pipe(startWith(this.form.status), takeUntilDestroyed()),
    { initialValue: this.form.status },
  );

  /**
   * Habilita el botón Submit. En modo creación se exige form válido y al
   * menos un archivo Excel; en modo edición basta con el form válido (la
   * gestión de bitstreams se cubre en el ciclo de edit).
   */
  readonly canSubmit = computed(() => {
    if (this.formStatus() !== 'VALID') return false;
    if (this.isEditMode()) return true;
    return this.files().length > 0;
  });

  constructor() {
    super();
    this.vocabApi.getEntries('tipos-dataset-estadistica').subscribe((entries) => {
      this.datasetOptions.set(entries);
      this.vocabulariesLoading.set(false);
    });
  }

  override getSectionName(): string {
    return 'digeex-estadistica';
  }

  override buildMetadata(): Record<string, MetadataValue[]> {
    const v = this.form.getRawValue();
    return {
      'dc.title': [mv(v.title)],
      'dc.description.abstract': [mv(v.abstract)],
      'dc.date.issued': [mv(toLocalIsoDate(v.issued))],
      'digeex.statsDataset': [mv(v.dataset)],
    };
  }

  override getFiles(): File[] {
    return this.files();
  }

  override getVisibility(): 'public' | 'private' {
    return this.visibility();
  }

  /** Selección del archivo desde el `<app-file-dropzone>` (single, .xlsx). */
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
   * Tras un submit exitoso volvemos al estado inicial para que el admin
   * pueda subir otro item al mismo programa sin recargar la pantalla.
   * En modo edición no aplica: la base navega a Mis envíos.
   */
  protected override afterSuccess(): void {
    if (this.isEditMode()) return;
    this.form.reset({ title: '', abstract: '', issued: '', dataset: '' });
    this.files.set([]);
    this.visibility.set('public');
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }

  /**
   * Pre-llena el form con los valores actuales del item; el dropdown de
   * Dataset retiene el stored value (`docentes`, `estudiantes`) que es lo
   * que DSpace guardó en `digeex.statsDataset`.
   */
  override applyItemToForm(item: Item): void {
    const m = item.metadata;
    const first = (k: string): string => m?.[k]?.[0]?.value ?? '';
    this.form.patchValue({
      title: first('dc.title'),
      abstract: first('dc.description.abstract'),
      issued: first('dc.date.issued'),
      dataset: first('digeex.statsDataset'),
    });
    this.visibility.set(item.discoverable ? 'public' : 'private');
  }

  /** Calcula el JSON Patch mínimo contra la metadata original del item. */
  override buildPatchFromForm(item: Item): JsonPatchEntry[] {
    const v = this.form.getRawValue();
    return buildMetadataPatch(
      {
        'dc.title': v.title,
        'dc.description.abstract': v.abstract,
        'dc.date.issued': toLocalIsoDate(v.issued),
        'digeex.statsDataset': v.dataset,
      },
      item.metadata ?? {},
    );
  }
}

registerSubmissionForm('Estadistica', StatsSubmissionForm);
