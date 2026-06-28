import {
  Component,
  input,
  output,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CardModule } from 'primeng/card';
import { ConfirmationService, MessageService } from 'primeng/api';
import { UserView, UserRole, RoleLabels } from '../../models/user-view.model';
import * as roleCaps from '../../../../../core/auth/role-capabilities';
import { UserStatusBadge } from '../user-status-badge/user-status-badge';
import { EmptyState } from '../../../../../shared/components/empty-state/empty-state';

/**
 * Tabla de usuarios con paginación server-side. El componente es pura
 * presentación: recibe la página actual por input, emite eventos lazy al
 * container (que traduce a page/size del facade), y delega acciones
 * fila-por-fila como outputs. Filtrado y búsqueda viven en el container
 * porque dependen del scope y del endpoint elegido.
 */
@Component({
  selector: 'app-user-table',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    TooltipModule,
    ConfirmDialogModule,
    CardModule,
    UserStatusBadge,
    EmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-table.html',
})
export class UserTable {
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  users = input.required<UserView[]>();
  currentUser = input<UserView | null>(null);
  totalRecords = input<number>(0);
  pageSize = input<number>(10);

  deactivateRequested = output<UserView>();
  reactivateRequested = output<UserView>();
  resetPasswordRequested = output<UserView>();
  modifyRoleRequested = output<UserView>();
  editRequested = output<UserView>();
  lazyLoad = output<TableLazyLoadEvent>();

  getRoleLabel(role: UserRole | null): string {
    return role === null ? 'Sin rol' : RoleLabels[role];
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

  /** Solo el superadmin cambia el rol de un usuario (RN-13); controla la visibilidad de la acción. */
  canModifyRoles(): boolean {
    return roleCaps.canModifyRoles(this.currentUser());
  }

  onResetPassword(user: UserView) {
    this.confirmationService.confirm({
      header: 'Restablecer Contraseña',
      message: `¿Estás seguro de restablecer la contraseña de ${this.getFullName(user)}? Se enviará un correo con las instrucciones.`,
      icon: 'pi pi-question-circle',
      rejectButtonProps: {
        label: 'Cancelar',
        severity: 'secondary',
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Sí, restablecer',
        severity: 'primary',
        icon: 'pi pi-key',
        rounded: true,
      },
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
      rejectButtonProps: {
        label: 'Cancelar',
        severity: 'secondary',
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Sí, desactivar',
        severity: 'danger',
        icon: 'pi pi-ban',
        rounded: true,
      },
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
      rejectButtonProps: {
        label: 'Cancelar',
        severity: 'secondary',
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Sí, reactivar',
        severity: 'primary',
        icon: 'pi pi-check',
        rounded: true,
      },
      accept: () => {
        this.reactivateRequested.emit(user);
      },
    });
  }
}
