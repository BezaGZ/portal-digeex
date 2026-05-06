import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from '../app.menuitem/app.menuitem';
import { UserManagementService } from '../../../features/administration/users/services/user-management.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, AppMenuitem, RouterModule],
  templateUrl: './app.menu.html',
})
export class AppMenu {
  private userService = inject(UserManagementService);

  /**
   * Vista del usuario logueado con el rol resuelto. Null mientras carga o si
   * el eperson no tiene grupo de rol del portal; en ese caso se muestran los
   * ítems comunes pero no los reservados a site admin.
   */
  private currentUser = toSignal(this.userService.currentUserView$, {
    initialValue: null,
  });

  model = computed<MenuItem[]>(() => {
    const isSuperadmin = this.currentUser()?.role === 'superadmin';

    const gestionItems: MenuItem[] = [
      { label: 'Reportes', icon: 'pi pi-fw pi-chart-bar', routerLink: ['/administrador/reportes'] },
    ];
    if (isSuperadmin) {
      gestionItems.unshift({
        label: 'Usuarios',
        icon: 'pi pi-fw pi-users',
        routerLink: ['/administrador/usuarios'],
      });
    }

    return [
      {
        label: 'Administración',
        items: [
          {
            label: 'Estadísticas',
            icon: 'pi pi-fw pi-home',
            routerLink: ['/administrador/estadisticas'],
          },
        ],
      },
      {
        label: 'Repositorio',
        items: [
          { label: 'Subdirecciones', icon: 'pi pi-fw pi-sitemap', routerLink: ['/administrador/subdirecciones'] },
          { label: 'Programas', icon: 'pi pi-fw pi-folder', routerLink: ['/administrador/programas'] },
          { label: 'Envíos', icon: 'pi pi-fw pi-upload', routerLink: ['/administrador/envios'] },
        ],
      },
      {
        label: 'Gestión',
        items: gestionItems,
      },
    ];
  });
}
