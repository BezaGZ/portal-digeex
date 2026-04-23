import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { Select } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { MessageModule } from 'primeng/message';

import { Group } from '../../../../../core/api/models/group.model';
import { UserView } from '../../models/user-view.model';
import { ChangeUserRoleInput } from '../../services/user-management.service';
import { labelForGroup } from '../user-dialog/user-dialog';

/** Opción renderizada en el dropdown de cambio de rol. */
interface RoleOption {
  value: { uuid: string; name: string };
  label: string;
}

/**
 * Cambia el grupo de rol de un eperson existente. Mismo dropdown dinámico que
 * UserDialog; no pide identidad porque el eperson ya existe en DSpace.
 */
@Component({
  selector: 'app-change-role-dialog',
  standalone: true,
  imports: [
    DialogModule,
    ButtonModule,
    Select,
    FloatLabelModule,
    MessageModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-role-dialog.html',
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
export class ChangeRoleDialog {
  private fb = inject(FormBuilder);

  visible = input.required<boolean>();
  target = input<UserView | null>(null);
  /** Grupos asignables provistos por el contenedor; el diálogo es
   *  puramente presentacional. */
  assignableGroups = input.required<Group[]>();

  visibleChange = output<boolean>();
  changeSubmitted = output<ChangeUserRoleInput>();

  errorMessage = signal<string | null>(null);

  form = this.fb.group({
    targetGroupUuid: [null as string | null, Validators.required],
  });

  roleOptions = computed<RoleOption[]>(() =>
    this.assignableGroups().map((g) => ({
      value: { uuid: g.uuid, name: g.name },
      label: labelForGroup(g.name),
    })),
  );

  getFullName(): string {
    const t = this.target();
    if (!t) return '';
    return `${t.firstName} ${t.lastName}`;
  }

  canSubmit(): boolean {
    return this.form.valid && this.target() !== null;
  }

  onHide() {
    this.visibleChange.emit(false);
    this.resetForm();
  }

  private resetForm() {
    this.form.reset({ targetGroupUuid: null });
    this.errorMessage.set(null);
  }

  onSubmit() {
    const targetValue = this.target();
    if (!targetValue) return;

    this.form.markAllAsTouched();
    if (!this.canSubmit()) {
      this.errorMessage.set('Por favor completa todos los campos requeridos');
      return;
    }

    const chosenUuid = this.form.getRawValue().targetGroupUuid!;
    const chosen = this.roleOptions().find((o) => o.value.uuid === chosenUuid);
    if (!chosen) {
      this.errorMessage.set('Selecciona un rol válido');
      return;
    }

    this.changeSubmitted.emit({
      uuid: targetValue.uuid,
      newGroup: chosen.value,
    });
  }
}
