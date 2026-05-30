import {
  Component,
  ChangeDetectionStrategy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { Select } from 'primeng/select';
import { ENTITY_TYPE, NAV_LOCATION } from '../../../../../core/config/digeex-values.config';
import { FileDropzoneComponent } from '../../../../../shared';

export type CollectionDialogMode = 'closed' | 'create' | 'edit';

export interface CollectionDialogPayload {
  siglas: string;
  titulo: string;
  description: string;
  entityType: string;
  navLocation: string;
  orden: string;
  /** Portada del programa cuando el usuario eligió una; null si no se tocó el dropzone. */
  coverFile: File | null;
}

interface SelectOption {
  label: string;
  value: string;
}

/**
 * Diálogo de crear/editar programa. En modo `create` pide nombre, tipo
 * (Documento/Galeria/Estadistica) y ubicación menú. En modo `edit`
 * precarga todo y bloquea el tipo: cambiarlo desconfigura el routing
 * por entity-type y desincroniza los SAFs y formularios de submission.
 */
@Component({
  selector: 'app-collection-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-dialog.html',
  imports: [ReactiveFormsModule, DialogModule, ButtonModule, InputTextModule, TextareaModule, Select, FileDropzoneComponent],
})
export class CollectionDialog {
  private readonly fb = inject(FormBuilder);

  readonly mode = input.required<CollectionDialogMode>();
  readonly initialSiglas = input<string>('');
  readonly initialTitulo = input<string>('');
  readonly initialDescription = input<string>('');
  readonly initialEntityType = input<string>('');
  readonly initialNavLocation = input<string>('');
  readonly initialOrden = input<string>('');

  readonly submitForm = output<CollectionDialogPayload>();
  readonly cancelForm = output<void>();

  readonly entityTypeOptions: SelectOption[] = [
    { label: 'Documento', value: ENTITY_TYPE.DOCUMENTO },
    { label: 'Galería', value: ENTITY_TYPE.GALERIA },
    { label: 'Estadística', value: ENTITY_TYPE.ESTADISTICA },
  ];

  readonly navLocationOptions: SelectOption[] = [
    { label: 'Menú principal', value: NAV_LOCATION.MENU_PRINCIPAL },
    { label: 'Menú secundario', value: NAV_LOCATION.MENU_SECUNDARIO },
  ];

  readonly form = this.fb.nonNullable.group({
    siglas: ['', [Validators.required, Validators.minLength(2)]],
    titulo: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    entityType: ['', [Validators.required]],
    navLocation: ['', [Validators.required]],
    orden: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
  });

  /** Portada elegida desde el dropzone; null cuando el usuario no tocó la selección. */
  readonly coverFile = signal<File | null>(null);

  private readonly snapshot = signal<{ titulo: string; description: string; navLocation: string; orden: string }>({
    titulo: '',
    description: '',
    navLocation: '',
    orden: '',
  });

  private readonly formValue = signal<{ titulo: string; description: string; navLocation: string; orden: string }>({
    titulo: '',
    description: '',
    navLocation: '',
    orden: '',
  });

  /** True si algún campo editable cambió respecto al estado inicial.
   * Las siglas no entran en el cómputo: en edit están bloqueadas igual
   * que el sufijo de subdirección, porque cambiarlas rompería los SAFs
   * y la URL del recurso. */
  readonly hasChanges = computed(() => {
    const s = this.snapshot();
    const v = this.formValue();
    return s.titulo !== v.titulo
      || s.description !== v.description
      || s.navLocation !== v.navLocation
      || s.orden !== v.orden;
  });

  /** El submit habilita cuando hubo cambios en algún campo o se eligió un cover nuevo. */
  readonly canSubmit = computed(() => this.hasChanges() || this.coverFile() !== null);

  constructor() {
    // El effect solo depende de `mode()` para resetear el form al
    // abrir/cerrar el dialog. Las señales `initial*` se leen con
    // `untracked()` para no re-disparar el reset cuando el padre
    // re-renderiza por cualquier otro motivo (p. ej. al seleccionar
    // un valor en un p-select que actualiza el form internamente).
    effect(() => {
      const m = this.mode();
      untracked(() => {
        const baseline = {
          titulo: this.initialTitulo(),
          description: this.initialDescription(),
          navLocation: this.initialNavLocation(),
          orden: this.initialOrden(),
        };
        this.snapshot.set(baseline);
        this.formValue.set(baseline);
        this.coverFile.set(null);
        this.form.reset({
          siglas: this.initialSiglas(),
          titulo: this.initialTitulo(),
          description: this.initialDescription(),
          entityType: this.initialEntityType(),
          navLocation: this.initialNavLocation(),
          orden: this.initialOrden(),
        });
        if (m === 'edit') {
          this.form.controls.siglas.disable({ emitEvent: false });
          this.form.controls.entityType.disable({ emitEvent: false });
        } else {
          this.form.controls.siglas.enable({ emitEvent: false });
          this.form.controls.entityType.enable({ emitEvent: false });
        }
      });
    });

    this.form.valueChanges.subscribe((v) => {
      this.formValue.set({
        titulo: v.titulo ?? '',
        description: v.description ?? '',
        navLocation: v.navLocation ?? '',
        orden: v.orden ?? '',
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid || !this.canSubmit()) {
      return;
    }
    this.submitForm.emit({
      siglas: this.form.controls.siglas.value || this.initialSiglas(),
      titulo: this.form.controls.titulo.value,
      description: this.form.controls.description.value,
      entityType: this.form.controls.entityType.value || this.initialEntityType(),
      navLocation: this.form.controls.navLocation.value,
      orden: this.form.controls.orden.value,
      coverFile: this.coverFile(),
    });
  }

  /** Selección de la portada desde el app-file-dropzone (single, image/*). */
  onCoverChange(files: File[]): void {
    this.coverFile.set(files[0] ?? null);
  }

  onCancel(): void {
    this.cancelForm.emit();
  }
}
