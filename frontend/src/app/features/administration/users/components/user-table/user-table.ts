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
import { UserManagementService } from '../../services/user-management.service';

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
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-table.html',
})
export class UserTable {
  private userService = inject(UserManagementService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  users = input.required<UserView[]>();

  createUserRequested = output<void>();
  refreshRequested = output<void>();

  globalFilterValue = signal<string>('');
  selectedRole = signal<UserRole | null>(null);
  selectedStatus = signal<UserStatus | null>(null);
  selectedSubdivision = signal<string | null>(null);

  currentUser = this.userService.currentUser;

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

  canDeactivate(user: UserView): { can: boolean; reason?: string } {
    if (user.uuid === this.currentUser().uuid) {
      return { can: false, reason: 'No puedes desactivarte a ti mismo' };
    }

    if (user.role === 'superadmin' && this.userService.activeSuperadminsCount() <= 1) {
      return { can: false, reason: 'No se puede desactivar el último Superadmin activo' };
    }

    return { can: true };
  }

  canModifyRoles(): boolean {
    return this.userService.canModifyRoles();
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
        const result = this.userService.resetPassword(user.uuid);
        if (result.success) {
          this.messageService.add({
            severity: 'success',
            summary: 'Contraseña restablecida',
            detail: 'Se ha enviado un correo con las instrucciones para restablecer la contraseña',
            life: 3000,
          });
          this.refreshRequested.emit();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: result.error,
            life: 3000,
          });
        }
      },
    });
  }

  onModifyRole(_user: UserView) {
    this.messageService.add({
      severity: 'info',
      summary: 'Funcionalidad en desarrollo',
      detail: 'La modificación de roles estará disponible próximamente',
      life: 3000,
    });
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
        const result = this.userService.deactivateUser(user.uuid);
        if (result.success) {
          this.messageService.add({
            severity: 'success',
            summary: 'Usuario desactivado',
            detail: `${this.getFullName(user)} ha sido desactivado`,
            life: 3000,
          });
          this.refreshRequested.emit();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: result.error,
            life: 3000,
          });
        }
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
        const result = this.userService.reactivateUser(user.uuid);
        if (result.success) {
          this.messageService.add({
            severity: 'success',
            summary: 'Usuario reactivado',
            detail: `${this.getFullName(user)} ha sido reactivado`,
            life: 3000,
          });
          this.refreshRequested.emit();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: result.error,
            life: 3000,
          });
        }
      },
    });
  }

  clearGlobalFilter(table: Table) {
    this.globalFilterValue.set('');
    table.clear();
  }
}
