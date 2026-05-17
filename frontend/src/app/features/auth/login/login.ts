import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AuthService } from '../../../core/auth/auth.service';
import { UserManagementService } from '../../administration/users/services/user-management.service';

/** Mensaje que se muestra cuando el eperson autenticado no tiene un grupo de rol del portal. */
export const LOGIN_MISSING_ROLE_MESSAGE =
  'Tu cuenta está activa pero sin rol asignado. Contacta al administrador para asignarte acceso.';

/** Mensaje que se muestra cuando las credenciales son inválidas. */
export const LOGIN_INVALID_CREDENTIALS_MESSAGE =
  'Correo o contraseña incorrectos. Intente de nuevo.';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, InputTextModule, PasswordModule, CheckboxModule, ButtonModule, CardModule],
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
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set(LOGIN_INVALID_CREDENTIALS_MESSAGE);
      },
    });
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
