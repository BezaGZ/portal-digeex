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

  /**
   * Menú filtrado por rol del caller (RN-32, RN-40, RN-41).
   *  - superadmin: ve todo (Subdirecciones, Programas, Cargar contenido, Reportes, Usuarios).
   *  - admin_subdireccion: ve Programas filtrado a su sub, Cargar contenido, Reportes.
   *    No ve Subdirecciones top-level (RN-40) ni Usuarios (Sprint 5 ya bloquea con superadminGuard).
   *  - personal_delegado: solo Cargar contenido. No ve Programas ni Subdirecciones ni Usuarios.
   *
   * El filtrado del sidebar es UX, no autorización: defensa real corre en
   * los guards y en los facades (ContentScopeService.assertWithinScope).
   */
  model = computed<MenuItem[]>(() => {
    const role = this.currentUser()?.role;
    const isSuperadmin = role === 'superadmin';
    const isAdminSub = role === 'admin_subdireccion';
    const isDelegado = role === 'personal_delegado';

    const sections: MenuItem[] = [];

    // Administración (Estadísticas) — la ven todos los logueados.
    sections.push({
      label: 'Administración',
      items: [
        {
          label: 'Estadísticas',
          icon: 'pi pi-fw pi-home',
          routerLink: ['/administrador/estadisticas'],
        },
      ],
    });

    // Repositorio — varía por rol.
    const repositorioItems: MenuItem[] = [];
    if (isSuperadmin) {
      repositorioItems.push({
        label: 'Subdirecciones',
        icon: 'pi pi-fw pi-sitemap',
        routerLink: ['/administrador/subdirecciones'],
      });
    }
    if (isSuperadmin || isAdminSub) {
      repositorioItems.push({
        label: 'Programas',
        icon: 'pi pi-fw pi-folder',
        routerLink: ['/administrador/programas'],
      });
    }
    if (isSuperadmin || isAdminSub || isDelegado) {
      repositorioItems.push({
        label: 'Cargar contenido',
        icon: 'pi pi-fw pi-upload',
        routerLink: ['/administrador/cargar'],
      });
    }
    if (repositorioItems.length > 0) {
      sections.push({ label: 'Repositorio', items: repositorioItems });
    }

    const gestionItems: MenuItem[] = [];
    if (isSuperadmin || isAdminSub) {
      gestionItems.push({
        label: 'Reportes',
        icon: 'pi pi-fw pi-chart-bar',
        routerLink: ['/administrador/reportes'],
      });
    }
    if (isSuperadmin) {
      gestionItems.unshift({
        label: 'Usuarios',
        icon: 'pi pi-fw pi-users',
        routerLink: ['/administrador/usuarios'],
      });
    }
    if (gestionItems.length > 0) {
      sections.push({ label: 'Gestión', items: gestionItems });
    }

    return sections;
  });
}
