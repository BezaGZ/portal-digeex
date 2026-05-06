import {
  Component,
  ChangeDetectionStrategy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

export type CommunityDialogMode = 'closed' | 'create' | 'edit';

export interface CommunityDialogPayload {
  name: string;
  sufijo: string;
  description: string;
}

/**
 * Diálogo de crear/editar subdirección. En modo `create` pide nombre y
 * sufijo. En modo `edit` precarga el nombre del target y bloquea el
 * campo sufijo: cambiarlo rompería los nombres de los grupos asociados
 * (ADMIN_<sufijo>, SUBMITTERS_<sufijo>). El padre escucha `submitForm` y
 * `cancelForm`.
 */
@Component({
  selector: 'app-community-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './community-dialog.html',
  imports: [ReactiveFormsModule, DialogModule, ButtonModule, InputTextModule, TextareaModule],
})
export class CommunityDialog {
  private readonly fb = inject(FormBuilder);

  readonly mode = input.required<CommunityDialogMode>();
  readonly initialName = input<string>('');
  readonly initialSufijo = input<string>('');
  readonly initialDescription = input<string>('');

  readonly submitForm = output<CommunityDialogPayload>();
  readonly cancelForm = output<void>();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    sufijo: ['', [Validators.required, Validators.pattern(/^[A-Z][A-Z0-9_]*$/)]],
    description: [''],
  });

  /**
   * Snapshot del valor inicial del form. Se actualiza cada vez que el
   * dialog se reabre. Sirve de baseline para detectar si el usuario
   * realmente modificó algo y habilitar/deshabilitar el botón Guardar.
   */
  private readonly snapshot = signal<{ name: string; description: string }>({
    name: '',
    description: '',
  });

  /** Versión observable del valor del form para comparar contra el snapshot. */
  private readonly formValue = signal<{ name: string; description: string }>({
    name: '',
    description: '',
  });

  /** True si algún campo editable cambió respecto al estado inicial. */
  readonly hasChanges = computed(() => {
    const s = this.snapshot();
    const v = this.formValue();
    return s.name !== v.name || s.description !== v.description;
  });

  constructor() {
    effect(() => {
      const m = this.mode();
      const baseline = {
        name: this.initialName(),
        description: this.initialDescription(),
      };
      this.snapshot.set(baseline);
      this.formValue.set(baseline);
      this.form.reset({
        name: this.initialName(),
        sufijo: this.initialSufijo(),
        description: this.initialDescription(),
      });
      if (m === 'edit') {
        this.form.controls.sufijo.disable({ emitEvent: false });
      } else {
        this.form.controls.sufijo.enable({ emitEvent: false });
      }
    });

    this.form.valueChanges.subscribe((v) => {
      this.formValue.set({
        name: v.name ?? '',
        description: v.description ?? '',
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid || !this.hasChanges()) {
      return;
    }
    this.submitForm.emit({
      name: this.form.controls.name.value,
      sufijo: this.form.controls.sufijo.value || this.initialSufijo(),
      description: this.form.controls.description.value,
    });
  }

  onCancel(): void {
    this.cancelForm.emit();
  }
}
