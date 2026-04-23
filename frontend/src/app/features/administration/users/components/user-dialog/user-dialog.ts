import {
  Component,
  OnDestroy,
  input,
  output,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { MessageModule } from 'primeng/message';
import { Subject } from 'rxjs';

import { Group } from '../../../../../core/api/models/group.model';
import { UserView } from '../../models/user-view.model';
import {
  CreateUserInput,
  UserManagementService,
} from '../../services/user-management.service';
import {
  ADMIN_GROUP_NAME_PREFIX,
  ADMINISTRATOR_GROUP_NAME,
  SUBMITTERS_GROUP_NAME_PREFIX,
} from '../../services/role-resolver';

/** Opción renderizada en el dropdown de rol: uuid + nombre real + label legible. */
interface RoleOption {
  value: { uuid: string; name: string };
  label: string;
}

/**
 * Diálogo de alta. Un solo dropdown "Rol" con los grupos reales del portal;
 * admin_subdireccion queda fijo en `SUBMITTERS_{su sufijo}`, superadmin elige.
 */
@Component({
  selector: 'app-user-dialog',
  standalone: true,
  imports: [
    DialogModule,
    ButtonModule,
    InputTextModule,
    Select,
    FloatLabelModule,
    MessageModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-dialog.html',
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
export class UserDialog implements OnDestroy {
  private fb = inject(FormBuilder);
  private userService = inject(UserManagementService);
  private destroy$ = new Subject<void>();

  visible = input.required<boolean>();
  caller = input<UserView | null>(null);

  visibleChange = output<boolean>();
  createSubmitted = output<CreateUserInput>();

  errorMessage = signal<string | null>(null);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    targetGroupUuid: [null as string | null, Validators.required],
  });

  /** Grupos asignables leídos del facade. El facade ya filtra nativos (Anonymous, COMMUNITY_*_ADMIN). */
  private assignableGroups = toSignal(this.userService.getAssignableGroups$(), {
    initialValue: [] as Group[],
  });

  /** Opciones filtradas: superadmin ve todas; admin_subdireccion solo SUBMITTERS_{sufijo}. */
  roleOptions = computed<RoleOption[]>(() => {
    const groups = this.assignableGroups();
    const callerRole = this.caller()?.role ?? null;
    const callerSuffix = this.caller()?.subdivision ?? null;
    const visible =
      callerRole === 'admin_subdireccion' && callerSuffix
        ? groups.filter(
            (g) => g.name === `${SUBMITTERS_GROUP_NAME_PREFIX}${callerSuffix}`,
          )
        : groups;
    return visible.map((g) => ({
      value: { uuid: g.uuid, name: g.name },
      label: labelForGroup(g.name),
    }));
  });

  roleControlDisabled = computed(() => this.caller()?.role === 'admin_subdireccion');

  constructor() {
    /**
     * Cuando el caller es admin_subdireccion, preselecciona el único grupo
     * disponible (su SUBMITTERS_{sufijo}) y deshabilita el control. Se usa
     * disable() en lugar de [disabled] porque este último con formControlName
     * emite warning y desincroniza el form.
     */
    effect(() => {
      const options = this.roleOptions();
      const ctrl = this.form.get('targetGroupUuid')!;
      if (this.roleControlDisabled() && options.length > 0) {
        this.form.patchValue({ targetGroupUuid: options[0].value.uuid }, { emitEvent: false });
        ctrl.disable({ emitEvent: false });
      } else {
        ctrl.enable({ emitEvent: false });
      }
    });
  }

  // form.valid no es signal; leer fresco en cada CD y en onSubmit.
  canSubmit(): boolean {
    return this.form.valid;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onHide() {
    this.visibleChange.emit(false);
    this.resetForm();
  }

  private resetForm() {
    this.form.reset({
      email: '',
      firstName: '',
      lastName: '',
      targetGroupUuid: null,
    });
    this.errorMessage.set(null);
  }

  onSubmit() {
    this.form.markAllAsTouched();
    if (!this.canSubmit()) {
      this.errorMessage.set('Por favor completa todos los campos requeridos');
      return;
    }
    const raw = this.form.getRawValue();
    const chosenUuid = raw.targetGroupUuid!;
    const chosen = this.roleOptions().find((o) => o.value.uuid === chosenUuid);
    if (!chosen) {
      this.errorMessage.set('Selecciona un rol válido');
      return;
    }
    this.createSubmitted.emit({
      email: raw.email!,
      firstName: raw.firstName!,
      lastName: raw.lastName!,
      targetGroup: chosen.value,
    });
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
    if (field.errors['minlength']) {
      const minLength = field.errors['minlength'].requiredLength;
      return `Debe tener al menos ${minLength} caracteres`;
    }
    return '';
  }
}

/** Label del dropdown derivado por prefijo del nombre; el sufijo viaja como texto
 *  para soportar subdirecciones nuevas sin tabla de mapeo. */
export function labelForGroup(name: string): string {
  if (name === ADMINISTRATOR_GROUP_NAME) return 'Superadministrador del portal';
  if (name.startsWith(ADMIN_GROUP_NAME_PREFIX)) {
    return `Admin · ${name.slice(ADMIN_GROUP_NAME_PREFIX.length).replace(/_/g, ' ')}`;
  }
  if (name.startsWith(SUBMITTERS_GROUP_NAME_PREFIX)) {
    return `Delegado · ${name.slice(SUBMITTERS_GROUP_NAME_PREFIX.length).replace(/_/g, ' ')}`;
  }
  return name;
}
