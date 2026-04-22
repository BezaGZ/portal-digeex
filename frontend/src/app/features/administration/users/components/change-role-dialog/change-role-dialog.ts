import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { Select } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { MessageModule } from 'primeng/message';

import { DSpaceApiService } from '../../../../../core/api/dspace-api.service';
import { UserRole, RoleLabels, UserView } from '../../models/user-view.model';
import { ChangeUserRoleInput } from '../../services/user-management.service';
import { ScopeSelector } from '../scope-selector/scope-selector';

/**
 * Diálogo para cambiar el rol de un usuario existente. Recibe al target
 * por input y reusa ScopeSelector para subdirección y colecciones, igual
 * que UserDialog. No pide email/nombre/apellido porque el eperson ya
 * existe en DSpace; solo se mueve entre grupos.
 *
 * El parent (Users container) decide cuándo abrirlo y maneja los errores
 * que devuelve el facade (RN-13, RN-27, RN-28). Acá solo se construye
 * el ChangeUserRoleInput y se emite.
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
    ScopeSelector,
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
export class ChangeRoleDialog implements OnDestroy {
  private fb = inject(FormBuilder);
  private dspaceApi = inject(DSpaceApiService);
  private destroy$ = new Subject<void>();

  visible = input.required<boolean>();
  target = input<UserView | null>(null);

  visibleChange = output<boolean>();
  changeSubmitted = output<ChangeUserRoleInput>();

  errorMessage = signal<string | null>(null);

  private scopeState = signal<{
    subdivisionCommunityUuid: string | null;
    collectionUuids: string[];
    valid: boolean;
  }>({ subdivisionCommunityUuid: null, collectionUuids: [], valid: false });

  form = this.fb.group({
    role: ['personal_delegado' as UserRole, Validators.required],
  });

  /**
   * Lista de communities para resolver el uuid inicial a partir del
   * nombre que viene en el UserView del target. El listado completo se
   * carga dentro de ScopeSelector.
   */
  private communities = toSignal(
    this.dspaceApi.getCommunities().pipe(map((response) => response._embedded['communities'])),
    { initialValue: [] },
  );

  scopeInitialSubdivisionUuid = computed<string | null>(() => {
    const targetValue = this.target();
    if (!targetValue || !targetValue.subdivision) return null;
    const matched = this.communities().find((c) => c.name === targetValue.subdivision);
    return matched?.uuid ?? null;
  });

  /** Rol actual del form, para que ScopeSelector reaccione y se muestre lo que toca. */
  currentRole = signal<UserRole>('personal_delegado');

  roleOptions = [
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

  showScopeSelector = computed(() => this.currentRole() !== 'superadmin');

  canSubmit = computed(() => {
    const target = this.target();
    const role = this.currentRole();
    const scope = this.scopeState();
    if (this.form.invalid) return false;
    if (!target) return false;
    if (role === 'superadmin') return true;
    return scope.valid;
  });

  constructor() {
    /**
     * Al recibir un nuevo target, se siembra el form con el rol actual
     * del usuario para que el dialog arranque mostrando "su" estado y
     * el operador solo cambie lo que quiera tocar. Si el target es un
     * huérfano (role='sin_asignar') no se siembra: el dropdown no incluye
     * esa opción, así que se deja el default ('personal_delegado') y el
     * operador elige qué rol asignarle.
     */
    effect(() => {
      const targetValue = this.target();
      if (targetValue && targetValue.role !== 'sin_asignar') {
        this.form.patchValue({ role: targetValue.role }, { emitEvent: false });
        this.currentRole.set(targetValue.role);
      }
    });

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
    this.form.reset({ role: 'personal_delegado' });
    this.currentRole.set('personal_delegado');
    this.errorMessage.set(null);
    this.scopeState.set({ subdivisionCommunityUuid: null, collectionUuids: [], valid: false });
  }

  onSubmit() {
    const targetValue = this.target();
    if (!targetValue) return;

    this.form.markAllAsTouched();

    if (!this.canSubmit()) {
      this.errorMessage.set('Por favor completa todos los campos requeridos');
      return;
    }

    const role = this.form.value.role!;
    const scope = this.scopeState();
    this.changeSubmitted.emit({
      uuid: targetValue.uuid,
      newRole: role,
      newSubdivisionCommunityUuid: role === 'superadmin' ? null : scope.subdivisionCommunityUuid,
      newCollectionUuids: role === 'personal_delegado' ? scope.collectionUuids : undefined,
    });
  }

  getFullName(): string {
    const t = this.target();
    if (!t) return '';
    return `${t.firstName} ${t.lastName}`;
  }
}
