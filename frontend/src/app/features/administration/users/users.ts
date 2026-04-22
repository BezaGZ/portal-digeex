import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api'; // MessageService se consume desde la raíz de la app

import { UserTable } from './components/user-table/user-table';
import { UserDialog } from './components/user-dialog/user-dialog';
import { ChangeRoleDialog } from './components/change-role-dialog/change-role-dialog';
import {
  UserManagementService,
  CreateUserInput,
  ChangeUserRoleInput,
} from './services/user-management.service';
import { BusinessRuleError, BusinessRuleErrorCode } from './services/business-rule-error';
import { UserView } from './models/user-view.model';
import { extractErrorDetail } from '../../../core/error/extract-error-detail';

/** Fallback del detail cuando el error no trae ningun texto util. */
const UNEXPECTED_ERROR_FALLBACK = 'Ocurrió un error al procesar la solicitud. Intenta más tarde.';

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
  imports: [ToastModule, UserTable, UserDialog, ChangeRoleDialog],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.html',
})
export class Users {
  private userService = inject(UserManagementService);
  private messageService = inject(MessageService);

  showCreateDialog = signal(false);
  showChangeRoleDialog = signal(false);
  changeRoleTarget = signal<UserView | null>(null);

  /**
   * Subject que dispara el refetch de la lista. El BehaviorSubject emite
   * inmediatamente al suscribirse, así la carga inicial sigue ocurriendo
   * en el OnInit implícito sin necesidad de startWith. Después de cada
   * mutación que altera el listado, un next() fuerza que switchMap pida
   * de nuevo a DSpace y el signal reciba la vista fresca.
   */
  private refresh$ = new BehaviorSubject<void>(undefined);

  visibleUsers = toSignal(
    this.refresh$.pipe(
      switchMap(() => this.userService.getVisibleUsers$()),
      map((paginated) => paginated.items),
    ),
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
        this.refresh$.next();
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
        this.refresh$.next();
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

  onModifyRoleRequested(user: UserView) {
    this.changeRoleTarget.set(user);
    this.showChangeRoleDialog.set(true);
  }

  onChangeRoleDialogClosed() {
    this.showChangeRoleDialog.set(false);
    this.changeRoleTarget.set(null);
  }

  onChangeRoleSubmitted(input: ChangeUserRoleInput) {
    this.userService.changeUserRole$(input).subscribe({
      next: () => {
        this.refresh$.next();
        this.messageService.add({
          severity: 'success',
          summary: 'Rol actualizado',
          detail: 'El rol del usuario fue actualizado correctamente',
          life: 3000,
        });
        this.showChangeRoleDialog.set(false);
        this.changeRoleTarget.set(null);
      },
      error: (err) => this.errorToToast(err),
    });
  }

  onCreateSubmitted(input: CreateUserInput) {
    this.userService.createUser$(input).subscribe({
      next: () => {
        this.refresh$.next();
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
   * tecnicas, son cosas que el UI ya deberia prevenir. Cualquier otro error
   * usa `extractErrorDetail` para revelar el mensaje del backend o del
   * Error antes de caer al copy generico.
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
      detail: extractErrorDetail(err as { error?: unknown; message?: unknown }, UNEXPECTED_ERROR_FALLBACK),
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
