import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { MessageModule } from 'primeng/message';

import { UserView } from '../../models/user-view.model';
import { allowedEmailDomainsValidator } from '../../../../../core/validators/email-domain.validator';
import { ALLOWED_USER_EMAIL_DOMAINS } from '../user-dialog/user-dialog';

/** Campos del eperson que el diálogo permite editar. */
export interface UpdateUserIdentityInput {
  uuid: string;
  changes: { firstName?: string; lastName?: string; email?: string };
}

/**
 * Diálogo presentacional de edición de identidad (RN-30). Pre-llena los tres
 * campos con la vista del target recibido por input y emite un diff que solo
 * incluye los campos que el usuario modificó. Submit deshabilitado hasta que
 * haya al menos un cambio respecto al snapshot inicial.
 */
@Component({
  selector: 'app-edit-user-dialog',
  standalone: true,
  imports: [
    DialogModule,
    ButtonModule,
    InputTextModule,
    FloatLabelModule,
    MessageModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-user-dialog.html',
  styles: [
    `
      :host ::ng-deep {
        .p-dialog {
          width: 90%;
          max-width: 600px;
        }

        .p-float-label {
          margin-top: 1.5rem;
        }

        .form-field {
          margin-bottom: 1.5rem;
        }
      }
    `,
  ],
})
export class EditUserDialog {
  private fb = inject(FormBuilder);

  visible = input.required<boolean>();
  target = input.required<UserView>();

  visibleChange = output<boolean>();
  editSubmitted = output<UpdateUserIdentityInput>();

  errorMessage = signal<string | null>(null);

  /** Lista de dominios institucionales que el HTML renderiza como hint. */
  readonly allowedDomains = ALLOWED_USER_EMAIL_DOMAINS;

  form = this.fb.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        allowedEmailDomainsValidator(ALLOWED_USER_EMAIL_DOMAINS),
      ],
    ],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
  });

  /** Snapshot inicial del target; se usa para calcular el diff al enviar. */
  private snapshot = computed(() => {
    const t = this.target();
    return { email: t.email, firstName: t.firstName, lastName: t.lastName };
  });

  /** Indica si el form tiene al menos un campo distinto al snapshot original. */
  hasChanges = signal(false);

  canSubmit(): boolean {
    return this.form.valid && this.hasChanges();
  }

  constructor() {
    effect(() => {
      const snap = this.snapshot();
      this.form.setValue({
        email: snap.email,
        firstName: snap.firstName,
        lastName: snap.lastName,
      }, { emitEvent: false });
      this.hasChanges.set(false);
    });

    this.form.valueChanges.subscribe(() => {
      this.hasChanges.set(this.diffAgainstSnapshot() !== null);
    });
  }

  onHide() {
    this.visibleChange.emit(false);
    this.errorMessage.set(null);
  }

  onSubmit() {
    this.form.markAllAsTouched();
    if (!this.canSubmit()) {
      this.errorMessage.set('Debes modificar al menos un campo.');
      return;
    }
    const changes = this.diffAgainstSnapshot();
    if (!changes) return;
    this.editSubmitted.emit({ uuid: this.target().uuid, changes });
  }

  hasError(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getErrorMessage(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (!field || !field.errors) return '';
    if (field.errors['required']) return 'Este campo es requerido';
    if (field.errors['email']) return 'Email inválido';
    if (field.errors['emailDomain']) {
      const allowed = field.errors['emailDomain'].allowedDomains as readonly string[];
      return `El correo debe terminar en ${allowed.join(', ')}`;
    }
    if (field.errors['minlength']) {
      const minLength = field.errors['minlength'].requiredLength;
      return `Debe tener al menos ${minLength} caracteres`;
    }
    return '';
  }

  /**
   * Devuelve los campos del form cuyo valor difiere del snapshot original.
   * Si no hay ninguna diferencia, retorna null y el submit se bloquea.
   */
  private diffAgainstSnapshot(): UpdateUserIdentityInput['changes'] | null {
    const snap = this.snapshot();
    const raw = this.form.getRawValue();
    const changes: UpdateUserIdentityInput['changes'] = {};
    if (raw.firstName !== snap.firstName) changes.firstName = raw.firstName ?? undefined;
    if (raw.lastName !== snap.lastName) changes.lastName = raw.lastName ?? undefined;
    if (raw.email !== snap.email) changes.email = raw.email ?? undefined;
    return Object.keys(changes).length > 0 ? changes : null;
  }
}
