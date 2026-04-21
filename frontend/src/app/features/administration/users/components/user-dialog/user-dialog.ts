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
import { map, takeUntil } from 'rxjs/operators';

import { DSpaceApiService } from '../../../../../core/api/dspace-api.service';
import { UserRole, RoleLabels, UserView } from '../../models/user-view.model';
import { CreateUserInput } from '../../services/user-management.service';

/**
 * Diálogo de creación de usuario. Recibe al caller por input y poblamos
 * el selector de subdirección desde getCommunities(). Cuando el caller
 * es admin_subdireccion el selector de rol queda bloqueado en
 * personal_delegado y la subdirección se precarga con su propia
 * community, para no enviar un input que el facade rechazaría con
 * INSUFFICIENT_PRIVILEGES en runtime.
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
  private dspaceApi = inject(DSpaceApiService);
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
    role: ['personal_delegado' as UserRole, Validators.required],
    subdivisionCommunityUuid: [null as string | null, Validators.required],
  });

  /**
   * Listado de communities aplanado a {label, value} directamente desde
   * DSpace. Se guarda también la proyección cruda para que el effect
   * pueda mapear el nombre de subdirección del caller a su uuid sin
   * tener que pelear con el shape final del select.
   */
  private communities = toSignal(
    this.dspaceApi.getCommunities().pipe(map((response) => response._embedded['communities'])),
    { initialValue: [] },
  );

  subdivisionOptions = computed(() =>
    this.communities().map((community) => ({ label: community.name, value: community.uuid })),
  );

  /**
   * Rol del caller → si es admin_subdireccion, el selector queda
   * bloqueado. El template lo lee para deshabilitar p-select.
   */
  roleSelectorDisabled = computed(() => this.caller()?.role === 'admin_subdireccion');

  allowedRoles = computed(() => {
    const callerRole = this.caller()?.role ?? null;
    if (callerRole === 'superadmin') {
      return [
        { label: RoleLabels.superadmin, value: 'superadmin' as UserRole, disabled: false },
        {
          label: RoleLabels.admin_subdireccion,
          value: 'admin_subdireccion' as UserRole,
          disabled: false,
        },
        {
          label: RoleLabels.personal_delegado,
          value: 'personal_delegado' as UserRole,
          disabled: false,
        },
      ];
    }
    if (callerRole === 'admin_subdireccion') {
      return [
        {
          label: RoleLabels.personal_delegado,
          value: 'personal_delegado' as UserRole,
          disabled: false,
        },
      ];
    }
    return [];
  });

  subdivisionFieldDisabled = computed(() => this.caller()?.role === 'admin_subdireccion');

  showSubdivisionField = computed(() => this.form.get('role')?.value !== 'superadmin');

  constructor() {
    /**
     * Cuando el caller es admin_subdireccion, precarga el formulario con
     * personal_delegado y la community del propio caller. Depende de
     * communities() porque hay que buscar el uuid que corresponde al
     * nombre de subdivisión del caller; si aún no llegaron, queda en
     * null y se reintenta al resolver.
     */
    effect(() => {
      const callerValue = this.caller();
      const communitiesList = this.communities();
      if (callerValue?.role === 'admin_subdireccion') {
        const matched = communitiesList.find((community) => community.name === callerValue.subdivision);
        this.form.patchValue({
          role: 'personal_delegado',
          subdivisionCommunityUuid: matched?.uuid ?? null,
        });
      }
    });

    /**
     * Si el rol cambia a superadmin ya no se pide subdirección. Para
     * cualquier otro rol se mantiene obligatoria.
     */
    this.form
      .get('role')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((role) => {
        const subdivisionControl = this.form.get('subdivisionCommunityUuid');

        if (role === 'superadmin') {
          subdivisionControl?.clearValidators();
          subdivisionControl?.setValue(null);
        } else {
          subdivisionControl?.setValidators(Validators.required);
        }

        subdivisionControl?.updateValueAndValidity();
      });
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
      role: 'personal_delegado',
      subdivisionCommunityUuid: null,
    });
    this.errorMessage.set(null);
  }

  onSubmit() {
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.errorMessage.set('Por favor completa todos los campos requeridos');
      return;
    }

    const formValue = this.form.value;
    this.createSubmitted.emit({
      email: formValue.email!,
      firstName: formValue.firstName!,
      lastName: formValue.lastName!,
      role: formValue.role!,
      subdivisionCommunityUuid: formValue.subdivisionCommunityUuid ?? null,
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
