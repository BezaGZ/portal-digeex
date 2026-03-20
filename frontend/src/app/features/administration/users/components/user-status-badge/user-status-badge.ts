import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { UserStatus } from '../../models/user-view.model';

@Component({
  selector: 'app-user-status-badge',
  standalone: true,
  imports: [TagModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-status-badge.html',
})
export class UserStatusBadge {
  status = input.required<UserStatus>();
  requiresPasswordChange = input<boolean>(false);

  label = () => {
    return this.status() === 'active' ? 'Activo' : 'Desactivado';
  };

  severity = () => {
    return this.status() === 'active' ? 'success' : 'secondary';
  };

  tooltip = () => {
    if (this.status() === 'active' && this.requiresPasswordChange()) {
      return 'Requiere cambio de contraseña';
    }
    return '';
  };
}
