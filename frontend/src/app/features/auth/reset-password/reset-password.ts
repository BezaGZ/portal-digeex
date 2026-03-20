import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PasswordModule, ButtonModule, CardModule],
  templateUrl: './reset-password.html',
})
export class ResetPasswordComponent {
  private router = inject(Router);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  errorMessage = '';

  onSubmit() {
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'La nueva contrasena y su confirmacion no coinciden.';
      return;
    }
    this.errorMessage = '';
    this.router.navigate(['/administrador/estadisticas']);
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
