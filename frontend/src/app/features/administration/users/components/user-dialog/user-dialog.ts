import {
  Component,
  OnDestroy,
  input,
  output,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { MessageModule } from 'primeng/message';
import { UserManagementService } from '../../services/user-management.service';
import { UserRole, RoleLabels, Subdivisions } from '../../models/user-view.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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

  visibleChange = output<boolean>();
  userCreated = output<void>();

  errorMessage = signal<string | null>(null);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    role: ['personal_delegado' as UserRole, Validators.required],
    subdivision: [this.userService.getDefaultSubdivision(), Validators.required],
  });

  allowedRoles = computed(() => {
    const roles = this.userService.getAllowedRolesForCreation();
    return roles.map((role) => ({
      label: RoleLabels[role],
      value: role,
      disabled: role === 'superadmin' && !this.userService.canCreateSuperadmin(),
    }));
  });

  subdivisions = Subdivisions.map((s) => ({ label: s, value: s }));

  showSubdivisionField = computed(() => {
    const role = this.form.get('role')?.value;
    return role !== 'superadmin';
  });

  subdivisionFieldDisabled = computed(() => {
    return this.userService.currentUser().role === 'admin_subdireccion';
  });

  constructor() {
    this.form
      .get('role')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((role) => {
        const subdivisionControl = this.form.get('subdivision');

        if (role === 'superadmin') {
          subdivisionControl?.clearValidators();
          subdivisionControl?.setValue(null);
        } else {
          subdivisionControl?.setValidators(Validators.required);

          if (this.userService.currentUser().role === 'admin_subdireccion') {
            subdivisionControl?.setValue(this.userService.getDefaultSubdivision());
          }
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
      subdivision: this.userService.getDefaultSubdivision(),
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

    const emailValidation = this.userService.validateEmail(formValue.email!);
    if (!emailValidation.valid) {
      this.errorMessage.set(emailValidation.error!);
      return;
    }

    if (this.userService.emailExistsAsActive(formValue.email!)) {
      this.errorMessage.set('Ya existe una cuenta activa con este correo');
      return;
    }

    const result = this.userService.createUser({
      email: formValue.email!,
      firstName: formValue.firstName!,
      lastName: formValue.lastName!,
      role: formValue.role!,
      subdivision: formValue.subdivision ?? null,
    });

    if (result.success) {
      this.userCreated.emit();
      this.onHide();
    } else {
      this.errorMessage.set(result.error!);
    }
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
