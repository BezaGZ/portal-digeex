import {
  Component,
  input,
  output,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CardModule } from 'primeng/card';
import { ConfirmationService, MessageService } from 'primeng/api';
import { UserView, UserRole, UserStatus, RoleLabels } from '../../models/user-view.model';
import { UserStatusBadge } from '../user-status-badge/user-status-badge';

/**
 * Componente presentacional: recibe la lista y el caller por input y
 * emite outputs cuando el usuario pide una acción. El contenedor decide
 * qué hacer contra el facade y maneja los toasts de resultado.
 */
@Component({
  selector: 'app-user-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    Select,
    TooltipModule,
    ConfirmDialogModule,
    CardModule,
    UserStatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-table.html',
})
export class UserTable {
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  users = input.required<UserView[]>();
  currentUser = input<UserView | null>(null);

  createUserRequested = output<void>();
  deactivateRequested = output<UserView>();
  reactivateRequested = output<UserView>();
  resetPasswordRequested = output<UserView>();
  modifyRoleRequested = output<UserView>();
  editRequested = output<UserView>();

  globalFilterValue = signal<string>('');
  selectedRole = signal<UserRole | null>(null);
  selectedStatus = signal<UserStatus | null>(null);
  selectedSubdivision = signal<string | null>(null);

  roleOptions = [
    { label: 'Todos los roles', value: null },
    { label: RoleLabels.superadmin, value: 'superadmin' as UserRole },
    { label: RoleLabels.admin_subdireccion, value: 'admin_subdireccion' as UserRole },
    { label: RoleLabels.personal_delegado, value: 'personal_delegado' as UserRole },
  ];

  statusOptions = [
    { label: 'Todos los estados', value: null },
    { label: 'Activo', value: 'active' as UserStatus },
    { label: 'Desactivado', value: 'inactive' as UserStatus },
  ];

  subdivisionOptions = computed(() => {
    const subdivisions = new Set(
      this.users()
        .map((u) => u.subdivision)
        .filter((s) => s !== null),
    );

    return [
      { label: 'Todas las subdirecciones', value: null },
      ...Array.from(subdivisions).map((s) => ({ label: s!, value: s! })),
    ];
  });

  filteredUsers = computed(() => {
    let filtered = this.users();

    if (this.selectedRole()) {
      filtered = filtered.filter((u) => u.role === this.selectedRole());
    }

    if (this.selectedStatus()) {
      filtered = filtered.filter((u) => u.status === this.selectedStatus());
    }

    if (this.selectedSubdivision()) {
      filtered = filtered.filter((u) => u.subdivision === this.selectedSubdivision());
    }

    return filtered;
  });

  getRoleLabel(role: UserRole): string {
    return RoleLabels[role];
  }

  getFullName(user: UserView): string {
    return `${user.firstName} ${user.lastName}`;
  }

  /**
   * Solo bloquea la auto-desactivación (RN-12) antes de abrir el diálogo
   * para no pedirle al servidor algo que va a rechazar. El resto de las
   * reglas (RN-11 y demás) las aplica el facade y vuelven como toast.
   */
  canDeactivate(user: UserView): { can: boolean; reason?: string } {
    const caller = this.currentUser();
    if (caller && user.uuid === caller.uuid) {
      return { can: false, reason: 'No puedes desactivarte a ti mismo' };
    }
    return { can: true };
  }

  canModifyRoles(): boolean {
    return this.currentUser()?.role === 'superadmin';
  }

  onCreateUser() {
    this.createUserRequested.emit();
  }

  onResetPassword(user: UserView) {
    this.confirmationService.confirm({
      header: 'Restablecer Contraseña',
      message: `¿Estás seguro de restablecer la contraseña de ${this.getFullName(user)}? Se enviará un correo con las instrucciones.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, restablecer',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.resetPasswordRequested.emit(user);
      },
    });
  }

  onModifyRole(user: UserView) {
    this.modifyRoleRequested.emit(user);
  }

  /**
   * Abre el diálogo de edición de identidad (RN-30). El scope lo valida el
   * facade; acá no se filtra la fila para mantener la tabla consistente con
   * el resto de acciones (defensa en profundidad).
   */
  onEdit(user: UserView) {
    this.editRequested.emit(user);
  }

  onDeactivate(user: UserView) {
    const validation = this.canDeactivate(user);

    if (!validation.can) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No se puede desactivar',
        detail: validation.reason,
        life: 3000,
      });
      return;
    }

    this.confirmationService.confirm({
      header: 'Desactivar Usuario',
      message: `¿Estás seguro de desactivar a ${this.getFullName(user)}? El usuario perderá acceso al sistema.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, desactivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deactivateRequested.emit(user);
      },
    });
  }

  onReactivate(user: UserView) {
    this.confirmationService.confirm({
      header: 'Reactivar Usuario',
      message: `¿Estás seguro de reactivar a ${this.getFullName(user)}? El usuario volverá a tener acceso al sistema.`,
      icon: 'pi pi-question-circle',
      acceptLabel: 'Sí, reactivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => {
        this.reactivateRequested.emit(user);
      },
    });
  }

  clearGlobalFilter(table: Table) {
    this.globalFilterValue.set('');
    table.clear();
  }
}
