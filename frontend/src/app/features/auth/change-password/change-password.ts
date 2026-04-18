import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PasswordModule, ButtonModule, CardModule],
  templateUrl: './change-password.html',
})
export class ChangePasswordComponent {
  private router = inject(Router);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  errorMessage = '';

  onSubmit() {
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'La nueva contraseña y su confirmación no coinciden.';
      return;
    }
    this.errorMessage = '';
    this.router.navigate(['/administrador/estadisticas']);
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
