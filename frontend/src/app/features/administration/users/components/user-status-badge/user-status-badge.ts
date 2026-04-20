import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { UserStatus } from '../../models/user-view.model';

@Component({
  selector: 'app-user-status-badge',
  standalone: true,
  imports: [TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-status-badge.html',
})
export class UserStatusBadge {
  status = input.required<UserStatus>();

  label = () => {
    return this.status() === 'active' ? 'Activo' : 'Desactivado';
  };

  severity = () => {
    return this.status() === 'active' ? 'success' : 'secondary';
  };
}
