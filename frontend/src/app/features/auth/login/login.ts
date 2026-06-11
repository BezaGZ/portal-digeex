import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../../core/auth/auth.service';
import { UserManagementService } from '../../administration/users/services/user-management.service';
import { AuthCardShell } from '../../../shared/components/auth-card-shell/auth-card-shell';

/** Mensaje que se muestra cuando el eperson autenticado no tiene un grupo de rol del portal. */
export const LOGIN_MISSING_ROLE_MESSAGE =
  'Tu cuenta está activa pero sin rol asignado. Contacta al administrador para asignarte acceso.';

/**
 * Mensaje del 401. DSpace responde el mismo 401 genérico para contraseña
 * incorrecta, cuenta desactivada (canLogIn=false) y cuenta que aún no
 * definió su contraseña — no revelar cuál caso es evita la enumeración de
 * cuentas, así que el mensaje orienta los tres sin confirmar ninguno.
 */
export const LOGIN_INVALID_CREDENTIALS_MESSAGE =
  'Correo o contraseña incorrectos. Si aún no ha definido su contraseña, ' +
  'revise el correo de activación; si su cuenta fue desactivada, contacte al administrador.';

/** Mensaje para fallos que no son de credenciales: red caída o error del servidor. */
export const LOGIN_SERVICE_UNAVAILABLE_MESSAGE =
  'No se pudo conectar con el servidor. Intente de nuevo en unos minutos.';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, InputTextModule, PasswordModule, CheckboxModule, ButtonModule, AuthCardShell],
  templateUrl: './login.html',
})
export class LoginComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  private userManagement = inject(UserManagementService);

  email = signal('');
  password = signal('');
  rememberMe = signal(false);
  errorMessage = signal('');
  isLoading = signal(false);

  /**
   * Tras un login exitoso contra DSpace espera el primer valor de
   * `currentUserView$` para conocer el rol del eperson autenticado.
   * Si resuelve, navega al panel administrativo. Si rechaza (no hay
   * grupo de rol del portal o la consulta de grupos falló), cierra
   * la sesión y muestra el mensaje correspondiente.
   */
  onLogin() {
    this.errorMessage.set('');
    this.isLoading.set(true);

    this.authService.login(this.email(), this.password()).subscribe({
      next: () => {
        firstValueFrom(this.userManagement.currentUserView$).then(
          () => {
            this.isLoading.set(false);
            this.router.navigate(['/administrador']);
          },
          () => {
            this.authService.logout().subscribe();
            this.isLoading.set(false);
            this.errorMessage.set(LOGIN_MISSING_ROLE_MESSAGE);
          },
        );
      },
      error: (err: { status?: number }) => {
        this.isLoading.set(false);
        // Solo el 401 habla de credenciales; un status 0 (red) o 5xx es
        // problema del servicio y culpar a la contraseña confunde al usuario.
        this.errorMessage.set(
          err?.status === 401 ? LOGIN_INVALID_CREDENTIALS_MESSAGE : LOGIN_SERVICE_UNAVAILABLE_MESSAGE,
        );
      },
    });
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
