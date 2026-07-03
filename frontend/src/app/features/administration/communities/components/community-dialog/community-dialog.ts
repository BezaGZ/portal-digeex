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

export type CommunityDialogMode = 'closed' | 'create' | 'edit';

export interface CommunityDialogPayload {
  nombreCorto: string;
  tituloCompleto: string;
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
  readonly initialNombreCorto = input<string>('');
  readonly initialTituloCompleto = input<string>('');
  readonly initialSufijo = input<string>('');
  readonly initialDescription = input<string>('');

  readonly submitForm = output<CommunityDialogPayload>();
  readonly cancelForm = output<void>();

  // Topes espejo de la convención de items (200/1000). El nombre corto (100)
  // alimenta el menú público y el sufijo (20) los nombres de grupo ADMIN_/SUBMITTERS_.
  readonly form = this.fb.nonNullable.group({
    nombreCorto: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    tituloCompleto: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    sufijo: ['', [Validators.required, Validators.pattern(/^[A-Z][A-Z0-9_]*$/), Validators.maxLength(20)]],
    description: ['', [Validators.maxLength(1000)]],
  });

  /**
   * Snapshot del valor inicial del form. Sirve de baseline para detectar
   * si el usuario realmente modificó algo y habilitar/deshabilitar el
   * botón Guardar. El nombreCorto NO entra en el snapshot porque está
   * bloqueado en edit (es identificador estable como sufijo y siglas).
   */
  private readonly snapshot = signal<{ tituloCompleto: string; description: string }>({
    tituloCompleto: '',
    description: '',
  });

  private readonly formValue = signal<{ tituloCompleto: string; description: string }>({
    tituloCompleto: '',
    description: '',
  });

  readonly hasChanges = computed(() => {
    const s = this.snapshot();
    const v = this.formValue();
    return s.tituloCompleto !== v.tituloCompleto || s.description !== v.description;
  });

  constructor() {
    effect(() => {
      const m = this.mode();
      untracked(() => {
        const baseline = {
          tituloCompleto: this.initialTituloCompleto(),
          description: this.initialDescription(),
        };
        this.snapshot.set(baseline);
        this.formValue.set(baseline);
        this.form.reset({
          nombreCorto: this.initialNombreCorto(),
          tituloCompleto: this.initialTituloCompleto(),
          sufijo: this.initialSufijo(),
          description: this.initialDescription(),
        });
        if (m === 'edit') {
          this.form.controls.nombreCorto.disable({ emitEvent: false });
          this.form.controls.sufijo.disable({ emitEvent: false });
        } else {
          this.form.controls.nombreCorto.enable({ emitEvent: false });
          this.form.controls.sufijo.enable({ emitEvent: false });
        }
      });
    });

    this.form.valueChanges.subscribe((v) => {
      this.formValue.set({
        tituloCompleto: v.tituloCompleto ?? '',
        description: v.description ?? '',
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid || !this.hasChanges()) {
      return;
    }
    this.submitForm.emit({
      nombreCorto: this.form.controls.nombreCorto.value || this.initialNombreCorto(),
      tituloCompleto: this.form.controls.tituloCompleto.value,
      sufijo: this.form.controls.sufijo.value || this.initialSufijo(),
      description: this.form.controls.description.value,
    });
  }

  onCancel(): void {
    this.cancelForm.emit();
  }
}
