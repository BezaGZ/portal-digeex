import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [FormsModule, InputTextModule, PasswordModule, ButtonModule],
  templateUrl: './profile.html',
})
export class Profile {
  email = 'admin.basica@mineduc.gob.gt';
  firstName = 'Admin';
  lastName = 'Edu Basica';
  phone = '';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  onSave() {}
}
