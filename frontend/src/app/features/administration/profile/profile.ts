import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';

import { AuthService } from '../../../core/auth/auth.service';
import { EPersonApiService } from '../../../core/api/eperson-api.service';
import { EPerson } from '../../../core/api/models/eperson.model';
import { extractErrorDetail } from '../../../core/error/extract-error-detail';

/** Copys del cambio de contrasena, centralizados para no repetirlos en exito y errores. */
const PASSWORD_CHANGE_ERROR_SUMMARY = 'No se pudo cambiar la contraseña';
const PASSWORD_CHANGE_ERROR_403 = 'La contraseña actual es incorrecta';
const PASSWORD_CHANGE_ERROR_422_FALLBACK = 'La nueva contraseña no cumple la política';
const PASSWORD_CHANGE_ERROR_FALLBACK = 'Ocurrió un error al guardar los cambios';

/**
 * `PasswordValidator` de DSpace 9.2 emite "Valid passwords must be at least
 * {minLength} characters long!" en ingles. Se captura el numero para que la
 * traduccion siga vigente si cambia `authentication-password.cfg`.
 */
const DSPACE_PASSWORD_MIN_LENGTH_PATTERN = /at least (\d+) characters/i;
const PASSWORD_CHANGE_SUCCESS_SUMMARY = 'Contraseña actualizada';
const PASSWORD_CHANGE_SUCCESS_DETAIL = 'La nueva contraseña ya está activa.';

/**
 * Copys del cambio de identidad (firstName / lastName). El summary se limita
 * al ámbito real del PATCH para no sugerir éxito global: si el usuario
 * guarda identidad + password a la vez y el password falla, el toast verde
 * de identidad no debe insinuar que todo quedó guardado.
 */
const IDENTITY_UPDATE_SUCCESS_SUMMARY = 'Nombre actualizado';
const IDENTITY_UPDATE_SUCCESS_DETAIL = 'Tu nombre y apellido quedaron guardados.';
const IDENTITY_UPDATE_ERROR_SUMMARY = 'No se pudo actualizar el nombre';
const IDENTITY_UPDATE_ERROR_FALLBACK = 'Ocurrió un error al guardar los cambios';

/**
 * Mensajes de validacion local del bloque de password. Se muestran en toast y
 * en el p-message inline del signal `passwordValidationError`, identificando
 * cual de las tres reglas triviales fallo.
 */
const PASSWORD_VALIDATION_CURRENT_REQUIRED = 'Ingresa tu contraseña actual.';
const PASSWORD_VALIDATION_NEW_REQUIRED = 'Ingresa la nueva contraseña.';
const PASSWORD_VALIDATION_CONFIRM_MISMATCH =
  'La nueva contraseña y la confirmación no coinciden.';

/**
 * Warning cuando el usuario pulsa Guardar sin haber tocado nada (mismo aviso
 * que `ProfilePageComponent.updateProfile`), para que el boton no sea un
 * no-op silencioso.
 */
const NO_CHANGES_SUMMARY = 'No hiciste cambios';
const NO_CHANGES_DETAIL = 'No se detectaron campos modificados para guardar.';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [FormsModule, InputTextModule, PasswordModule, ButtonModule, MessageModule, CardModule],
  templateUrl: './profile.html',
})
export class Profile implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly epersonApi = inject(EPersonApiService);
  private readonly messageService = inject(MessageService);

  email = '';
  firstName = '';
  lastName = '';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  /**
   * Snapshots del firstName / lastName del usuario autenticado. Se comparan
   * con los inputs para armar el PATCH solo con lo que cambio, y se refrescan
   * tras un save exitoso para que un segundo onSave sin cambios no dispare
   * otra peticion.
   */
  private originalFirstName = '';
  private originalLastName = '';

  /**
   * Mensaje de validacion local del bloque de password. El template lo lee
   * para pintar un p-message inline. Queda `null` cuando todo esta bien; se
   * limpia al tipear o cuando un save posterior pasa validacion.
   */
  readonly passwordValidationError = signal<string | null>(null);

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.email = user.email;
      this.firstName = user.firstName;
      this.lastName = user.lastName;
      this.originalFirstName = user.firstName;
      this.originalLastName = user.lastName;
    }
  }

  /**
   * Estado del bloque de password: tres campos llenos y confirmacion
   * coincidiendo. Lo usan los tests; la logica interna de onSave se apoya
   * en `hasPasswordAttempt` + `getPasswordValidationError`.
   */
  get isPasswordChangeValid(): boolean {
    return (
      this.currentPassword.length > 0 &&
      this.newPassword.length > 0 &&
      this.newPassword === this.confirmPassword
    );
  }

  /**
   * Orquestador del boton Guardar (patron de `ProfilePageComponent.updateProfile`):
   * detecta cambio de identity y/o intento de cambio de password y dispatchea
   * los PATCH independientes. Sin cambios, warning. Intento invalido, motivo
   * exacto en toast en lugar de un 422 generico.
   */
  onSave(): void {
    const uuid = this.authService.currentUser()?.uuid;
    if (!uuid) {
      return;
    }

    const identityChanges = this.buildIdentityChanges();
    const hasIdentityChange = identityChanges !== null;
    const passwordAttempted = this.hasPasswordAttempt();

    if (!hasIdentityChange && !passwordAttempted) {
      this.messageService.add({
        severity: 'warn',
        summary: NO_CHANGES_SUMMARY,
        detail: NO_CHANGES_DETAIL,
      });
      return;
    }

    if (hasIdentityChange) {
      this.epersonApi.update(uuid, identityChanges).subscribe({
        next: (response: EPerson) => this.onIdentityUpdateSuccess(response),
        error: (err: HttpErrorResponse) => this.showIdentityError(err),
      });
    }

    if (passwordAttempted) {
      const validationError = this.getPasswordValidationError();
      if (validationError) {
        this.passwordValidationError.set(validationError);
        this.messageService.add({
          severity: 'error',
          summary: PASSWORD_CHANGE_ERROR_SUMMARY,
          detail: validationError,
        });
        return;
      }
      this.passwordValidationError.set(null);
      this.epersonApi.changeOwnPassword(uuid, this.currentPassword, this.newPassword).subscribe({
        next: () => this.onPasswordChangeSuccess(),
        error: (err: HttpErrorResponse) => this.showPasswordError(err),
      });
    }
  }

  /**
   * True si el usuario toco al menos uno de los tres campos. Equivale al
   * `passEntered` de `ProfilePageComponent.updateSecurity` y evita que
   * alguien que solo cambia nombre reciba un toast pidiendole la contrasena.
   */
  private hasPasswordAttempt(): boolean {
    return (
      this.currentPassword.length > 0 ||
      this.newPassword.length > 0 ||
      this.confirmPassword.length > 0
    );
  }

  /**
   * Valida la seccion de password con las mismas reglas triviales que
   * dspace-angular (`checkPasswordEmpty` + `checkPasswordsEqual`) y devuelve
   * el motivo o null. La complejidad la sigue validando el backend.
   */
  private getPasswordValidationError(): string | null {
    if (this.currentPassword.length === 0) {
      return PASSWORD_VALIDATION_CURRENT_REQUIRED;
    }
    if (this.newPassword.length === 0) {
      return PASSWORD_VALIDATION_NEW_REQUIRED;
    }
    if (this.newPassword !== this.confirmPassword) {
      return PASSWORD_VALIDATION_CONFIRM_MISMATCH;
    }
    return null;
  }

  /**
   * Hook de (ngModelChange) de los tres campos. Limpia el marcador inline
   * mientras el usuario escribe la correccion. El toast previo lo maneja
   * PrimeNG con su propio timeout.
   */
  onPasswordFieldChange(): void {
    this.passwordValidationError.set(null);
  }

  /**
   * Devuelve solo los campos que cambiaron frente a los snapshots, o `null`
   * si no hay diferencias. `EPersonApiService.update()` traduce cada campo
   * presente a una operacion replace, asi que mandar el parcial evita un
   * PATCH vacio cuando se abre el formulario y se guarda sin tocar nada.
   */
  private buildIdentityChanges(): { firstName?: string; lastName?: string } | null {
    const changes: { firstName?: string; lastName?: string } = {};
    if (this.firstName !== this.originalFirstName) {
      changes.firstName = this.firstName;
    }
    if (this.lastName !== this.originalLastName) {
      changes.lastName = this.lastName;
    }
    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * Limpia los campos de password, descarta el marcador inline y muestra el
   * toast de exito. El signal se limpia por robustez si habia quedado un
   * error visible que luego el usuario arreglo.
   */
  private onPasswordChangeSuccess(): void {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordValidationError.set(null);
    this.messageService.add({
      severity: 'success',
      summary: PASSWORD_CHANGE_SUCCESS_SUMMARY,
      detail: PASSWORD_CHANGE_SUCCESS_DETAIL,
    });
  }

  /**
   * Refresca los snapshots con los valores guardados y propaga el EPerson
   * al signal de AuthService para que el topbar refleje el nombre nuevo sin
   * relogin ni GET adicional.
   */
  private onIdentityUpdateSuccess(response: EPerson): void {
    this.authService.setCurrentUserFromEPerson(response);
    this.originalFirstName = this.firstName;
    this.originalLastName = this.lastName;
    this.messageService.add({
      severity: 'success',
      summary: IDENTITY_UPDATE_SUCCESS_SUMMARY,
      detail: IDENTITY_UPDATE_SUCCESS_DETAIL,
    });
  }

  /**
   * Toast para errores del PATCH de identidad. Summary fijo y detail delegado
   * a `extractErrorDetail`, que prioriza el mensaje del backend sobre el
   * fallback generico.
   */
  private showIdentityError(err: HttpErrorResponse): void {
    this.messageService.add({
      severity: 'error',
      summary: IDENTITY_UPDATE_ERROR_SUMMARY,
      detail: extractErrorDetail(err, IDENTITY_UPDATE_ERROR_FALLBACK),
    });
  }

  /**
   * Mapea el error del PATCH de password a un toast. 403 es contrasena
   * actual incorrecta; 422 traduce el mensaje de longitud de
   * `PasswordValidator` y cae al mensaje del backend si no coincide el
   * patron; cualquier otro status usa el fallback generico.
   */
  private showPasswordError(err: HttpErrorResponse): void {
    let detail: string;
    switch (err.status) {
      case 403:
        detail = PASSWORD_CHANGE_ERROR_403;
        break;
      case 422: {
        const raw = err.error?.message;
        const minLengthMatch = raw?.match(DSPACE_PASSWORD_MIN_LENGTH_PATTERN);
        if (minLengthMatch) {
          detail = `La nueva contraseña debe tener al menos ${minLengthMatch[1]} caracteres.`;
        } else {
          detail = raw ?? PASSWORD_CHANGE_ERROR_422_FALLBACK;
        }
        break;
      }
      default:
        detail = extractErrorDetail(err, PASSWORD_CHANGE_ERROR_FALLBACK);
    }

    this.messageService.add({
      severity: 'error',
      summary: PASSWORD_CHANGE_ERROR_SUMMARY,
      detail,
    });
  }
}
