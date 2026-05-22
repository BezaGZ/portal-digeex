import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
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
import { Bitstream } from '../../../../../core/api/models/bitstream.model';
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
    DecimalPipe,
  ],
})
export class StatsSubmissionForm extends BaseSubmissionForm {
  private readonly fb = inject(FormBuilder);
  private readonly vocabApi = inject(VocabularyApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Toggle Pública/Privada que controla `discoverable` post-archive. */
  readonly visibility = signal<'public' | 'private'>('public');

  /** Bitstream Excel: un único archivo por item, seleccionado vía `<app-file-dropzone>`. */
  readonly files = signal<File[]>([]);

  /** Entradas del dropdown de Dataset (vocabulario `tipos-dataset-estadistica`). */
  readonly datasetOptions = signal<VocabularyEntry[]>([]);

  /**
   * Bitstream actual del bundle ORIGINAL en modo edición. Stats archiva un
   * único Excel por item, así que el array tiene 0 o 1 elementos; el patrón
   * sigue `pendingDeletes` + `pendingAdds` igual que Document y Gallery del
   * Sprint 6 para mantener un solo modelo mental de gestión de bitstreams.
   */
  readonly currentBitstreams = signal<Bitstream[]>([]);

  /**
   * UUIDs marcados para borrar; el borrado real ocurre recién en el Submit
   * (`getBitstreamsToRemove`). Hasta entonces es un toggle visual.
   */
  readonly pendingDeletes = signal<ReadonlySet<string>>(new Set());

  /** Archivos nuevos en la pila de "subir al ORIGINAL" del próximo Submit. */
  readonly pendingAdds = signal<File[]>([]);

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
   * menos un archivo Excel. En modo edición se exige form válido y un
   * conteo efectivo de bitstreams > 0 (current - pendingDeletes + pendingAdds);
   * el item debe quedar con al menos un Excel adjunto tras el guardado.
   */
  readonly canSubmit = computed(() => {
    if (this.formStatus() !== 'VALID') return false;
    if (this.isEditMode()) {
      const effective =
        this.currentBitstreams().length -
        this.pendingDeletes().size +
        this.pendingAdds().length;
      return effective > 0;
    }
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
   * que DSpace guardó en `digeex.statsDataset`. Carga la primera (y única)
   * página del bundle ORIGINAL para exponer el Excel actual en la UI con
   * opción de marcarlo para reemplazo.
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

    this.itemFacade
      .listOriginalBitstreams$(item.uuid, 0, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.currentBitstreams.set(p.items));
  }

  /**
   * Toggle del set de uuids marcados para borrar; el template lo invoca por
   * fila. Si el toggle restaura un bitstream (lo saca del set), también limpia
   * `pendingAdds`: el admin canceló el reemplazo, no tiene sentido conservar
   * el archivo nuevo pendiente porque entonces violaría la invariante "un
   * Excel por item" al guardar.
   */
  togglePendingDelete(uuid: string): void {
    const next = new Set(this.pendingDeletes());
    if (next.has(uuid)) {
      next.delete(uuid);
      this.pendingAdds.set([]);
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
   * El dropzone gobierna la pila: cualquier emisión (select, remove, clear)
   * llega como el estado completo del componente y `pendingAdds` lo refleja
   * sin lógica paralela. Cuando viene con archivos y hay un bitstream actual
   * sin marcar para borrar, el método lo auto-marca: el admin está expresando
   * intención de reemplazo, el sistema sincroniza para que pendingDeletes +
   * pendingAdds cierren en un único bitstream efectivo (invariante "un Excel
   * por item"). Cuando viene vacío, revierte la auto-marca para no dejar al
   * item sin Excel después de cancelar el upload desde el dropzone.
   */
  onAddBitstreams(files: File[]): void {
    if (files.length === 0) {
      this.pendingAdds.set([]);
      const onlyAutoMarked =
        this.currentBitstreams().length === 1 &&
        this.pendingDeletes().has(this.currentBitstreams()[0].uuid);
      if (onlyAutoMarked) {
        this.pendingDeletes.set(new Set());
      }
      return;
    }

    const undeleted = this.currentBitstreams().find(
      (bs) => !this.pendingDeletes().has(bs.uuid),
    );
    if (undeleted) {
      const nextDeletes = new Set(this.pendingDeletes());
      nextDeletes.add(undeleted.uuid);
      this.pendingDeletes.set(nextDeletes);
    }

    this.pendingAdds.set([...files]);
  }

  protected override getBitstreamsToRemove(): string[] {
    return Array.from(this.pendingDeletes());
  }

  protected override getBitstreamsToAdd(): File[] {
    return this.pendingAdds();
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
