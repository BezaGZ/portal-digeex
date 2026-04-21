import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api'; // MessageService se consume desde la raíz de la app

import { UserTable } from './components/user-table/user-table';
import { UserDialog } from './components/user-dialog/user-dialog';
import { UserManagementService, CreateUserInput } from './services/user-management.service';
import { BusinessRuleError, BusinessRuleErrorCode } from './services/business-rule-error';
import { UserView } from './models/user-view.model';

/**
 * Contenedor de la pantalla de gestión de usuarios.
 *
 * Se suscribe a getVisibleUsers$ y currentUserView$ del facade y delega
 * ahí todas las mutaciones. El trabajo propio del contenedor es mapear
 * los errores del facade a toasts: BusinessRuleError trae un code tipado
 * que se traduce a un copy en es-GT, y cualquier otro error cae al toast
 * genérico.
 */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ToastModule, UserTable, UserDialog],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.html',
})
export class Users {
  private userService = inject(UserManagementService);
  private messageService = inject(MessageService);

  showCreateDialog = signal(false);

  visibleUsers = toSignal(
    this.userService.getVisibleUsers$().pipe(map((paginated) => paginated.items)),
    { initialValue: [] as UserView[] },
  );

  currentUser = toSignal(this.userService.currentUserView$, { initialValue: null });

  onCreateUserRequested() {
    this.showCreateDialog.set(true);
  }

  onDialogClosed() {
    this.showCreateDialog.set(false);
  }

  onDeactivateRequested(user: UserView) {
    this.userService.deactivateUser$(user.uuid).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Usuario desactivado',
          detail: `${user.firstName} ${user.lastName} ha sido desactivado`,
          life: 3000,
        });
      },
      error: (err) => this.errorToToast(err),
    });
  }

  onReactivateRequested(user: UserView) {
    this.userService.reactivateUser$(user.uuid).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Usuario reactivado',
          detail: `${user.firstName} ${user.lastName} ha sido reactivado`,
          life: 3000,
        });
      },
      error: (err) => this.errorToToast(err),
    });
  }

  onResetPasswordRequested(user: UserView) {
    this.userService.resetPassword$(user.email).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Contraseña restablecida',
          detail: 'Se ha enviado un correo con las instrucciones para restablecer la contraseña',
          life: 3000,
        });
      },
      error: (err) => this.errorToToast(err),
    });
  }

  onCreateSubmitted(input: CreateUserInput) {
    this.userService.createUser$(input).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Usuario creado',
          detail: `${input.firstName} ${input.lastName} ha sido creado`,
          life: 3000,
        });
        this.showCreateDialog.set(false);
      },
      error: (err) => this.errorToToast(err),
    });
  }

  /**
   * Traduce el error del facade a un toast. Las reglas bloqueantes del
   * propio usuario (RN-11, RN-12) salen como warn porque no son fallas
   * técnicas, son cosas que el UI ya debería prevenir. Todo lo demás,
   * incluido un HTTP roto, cae al toast genérico de error.
   */
  private errorToToast(err: unknown) {
    if (err instanceof BusinessRuleError) {
      const isWarning = err.code === 'LAST_SUPERADMIN' || err.code === 'SELF_DEACTIVATE';
      this.messageService.add({
        severity: isWarning ? 'warn' : 'error',
        summary: this.summaryForCode(err.code),
        detail: err.message,
        life: 5000,
      });
      return;
    }
    this.messageService.add({
      severity: 'error',
      summary: 'Error inesperado',
      detail: 'Ocurrió un error al procesar la solicitud. Intenta más tarde.',
      life: 5000,
    });
  }

  private summaryForCode(code: BusinessRuleErrorCode): string {
    const labels: Record<BusinessRuleErrorCode, string> = {
      LAST_SUPERADMIN: 'Operación no permitida',
      SELF_DEACTIVATE: 'Operación no permitida',
      DUPLICATE_EMAIL: 'Correo duplicado',
      EMAIL_INVALID: 'Correo inválido',
      SUBDIVISION_REQUIRED: 'Subdirección requerida',
      INSUFFICIENT_PRIVILEGES: 'Permisos insuficientes',
      NOT_FOUND: 'No encontrado',
    };
    return labels[code];
  }
}
