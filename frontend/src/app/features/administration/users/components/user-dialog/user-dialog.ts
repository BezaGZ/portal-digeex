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
import { ScopeSelector } from '../scope-selector/scope-selector';

/**
 * Diálogo de creación de usuario. Recibe al caller por input y delega la
 * elección de subdirección/colecciones al subcomponente ScopeSelector
 * para que toda la lógica de "qué scope aplica a qué rol" viva en un
 * solo lugar (también lo usa ChangeRoleDialog).
 *
 * Cuando el caller es admin_subdireccion, el rol queda fijo en
 * personal_delegado y la subdivisión se precarga con la suya, para no
 * mandarle al facade un input que rechazaría con INSUFFICIENT_PRIVILEGES.
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
    ScopeSelector,
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

  /**
   * Estado actual del scope reportado por ScopeSelector. Se guarda como
   * signal para que el computed `canSubmit` lo combine con la validez
   * del form de identidad. El parent no inspecciona el form interno del
   * subcomponente.
   */
  private scopeState = signal<{
    subdivisionCommunityUuid: string | null;
    collectionUuids: string[];
    valid: boolean;
  }>({ subdivisionCommunityUuid: null, collectionUuids: [], valid: false });

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    role: ['personal_delegado' as UserRole, Validators.required],
  });

  /**
   * Lista de communities solo para resolver el uuid de la subdirección
   * del caller admin_subdireccion. El listado completo lo carga el
   * propio ScopeSelector; acá solo se usa para precargar el initial.
   */
  private communities = toSignal(
    this.dspaceApi.getCommunities().pipe(map((response) => response._embedded['communities'])),
    { initialValue: [] },
  );

  scopeInitialSubdivisionUuid = computed<string | null>(() => {
    const callerValue = this.caller();
    if (callerValue?.role !== 'admin_subdireccion') return null;
    const matched = this.communities().find((c) => c.name === callerValue.subdivision);
    return matched?.uuid ?? null;
  });

  scopeDisabledSubdivision = computed(() => this.caller()?.role === 'admin_subdireccion');

  /** Rol actual del form, usado para indicarle a ScopeSelector qué mostrar. */
  currentRole = signal<UserRole>('personal_delegado');

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

  showScopeSelector = computed(() => this.currentRole() !== 'superadmin');

  /**
   * El submit se habilita cuando el form de identidad es válido y, si el
   * rol pide scope, el ScopeSelector también marcó valid. Para superadmin
   * el ScopeSelector ni se renderiza, así que basta el form de identidad.
   *
   * Importante leer currentRole y scopeState arriba: si el primer if cortara
   * antes (form.invalid es un getter, no un signal), el computed se quedaría
   * sin dependencias trackeadas y no se invalidaría cuando scopeState cambie.
   */
  canSubmit = computed(() => {
    const role = this.currentRole();
    const scope = this.scopeState();
    if (this.form.invalid) return false;
    if (role === 'superadmin') return true;
    return scope.valid;
  });

  constructor() {
    /**
     * Cuando el caller es admin_subdireccion el rol queda fijo en
     * personal_delegado. Sin esto el form arrancaría con el default y
     * el ScopeSelector mostraría colecciones desde el primer render
     * antes de que el usuario tocara nada.
     */
    effect(() => {
      const callerValue = this.caller();
      if (callerValue?.role === 'admin_subdireccion') {
        this.form.patchValue({ role: 'personal_delegado' }, { emitEvent: false });
        this.currentRole.set('personal_delegado');
      }
    });

    /**
     * Mantener el signal currentRole sincronizado con el form, para que
     * los computed que dependen de él reaccionen al cambio de selector.
     */
    this.form
      .get('role')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((role) => {
        if (role) this.currentRole.set(role);
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onScopeChange(scope: {
    subdivisionCommunityUuid: string | null;
    collectionUuids: string[];
    valid: boolean;
  }) {
    this.scopeState.set(scope);
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
    });
    this.currentRole.set('personal_delegado');
    this.errorMessage.set(null);
    this.scopeState.set({ subdivisionCommunityUuid: null, collectionUuids: [], valid: false });
  }

  onSubmit() {
    this.form.markAllAsTouched();

    if (!this.canSubmit()) {
      this.errorMessage.set('Por favor completa todos los campos requeridos');
      return;
    }

    const formValue = this.form.value;
    const scope = this.scopeState();
    const role = formValue.role!;
    this.createSubmitted.emit({
      email: formValue.email!,
      firstName: formValue.firstName!,
      lastName: formValue.lastName!,
      role,
      subdivisionCommunityUuid: role === 'superadmin' ? null : scope.subdivisionCommunityUuid,
      collectionUuids: role === 'personal_delegado' ? scope.collectionUuids : undefined,
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
