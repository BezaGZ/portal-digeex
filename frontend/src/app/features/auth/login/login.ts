import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, InputTextModule, PasswordModule, CheckboxModule, ButtonModule, CardModule],
  templateUrl: './login.html',
})
export class LoginComponent {
  private router = inject(Router);

  email = signal('');
  password = signal('');
  rememberMe = signal(false);

  onLogin() {
    const mustChangePassword = true;
    if (mustChangePassword) {
      this.router.navigate(['/restablecer-contrasena']);
      return;
    }
    this.router.navigate(['/administrador/estadisticas']);
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
