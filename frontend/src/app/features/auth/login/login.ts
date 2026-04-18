import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, InputTextModule, PasswordModule, CheckboxModule, ButtonModule, CardModule],
  templateUrl: './login.html',
})
export class LoginComponent {
  private router = inject(Router);
  private authService = inject(AuthService);

  email = signal('');
  password = signal('');
  rememberMe = signal(false);
  errorMessage = signal('');
  isLoading = signal(false);

  onLogin() {
    this.errorMessage.set('');
    this.isLoading.set(true);

    this.authService.login(this.email(), this.password()).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/administrador/estadisticas']);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Correo o contraseña incorrectos. Intente de nuevo.');
      },
    });
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
