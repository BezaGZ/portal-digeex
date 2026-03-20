import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { UserTable } from './components/user-table/user-table';
import { UserDialog } from './components/user-dialog/user-dialog';
import { UserManagementService } from './services/user-management.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ToastModule, UserTable, UserDialog],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.html',
})
export class Users {
  private userService = inject(UserManagementService);

  showCreateDialog = signal(false);

  visibleUsers = this.userService.users;

  onCreateUserRequested() {
    this.showCreateDialog.set(true);
  }

  onDialogClosed() {
    this.showCreateDialog.set(false);
  }

  onUserCreated() {
    this.showCreateDialog.set(false);
  }

  onRefreshRequested() {}
}
