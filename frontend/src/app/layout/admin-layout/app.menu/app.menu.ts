import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';

import { AppMenuitem } from '../app.menuitem/app.menuitem';
import { AuthCallerService } from '../../../features/administration/shared/services/auth-caller.service';
import { UserRole } from '../../../features/administration/users/models/user-view.model';
import { SCOPE_ANY_AUTHENTICATED } from '../../../core/auth/role-scopes';
import {
  ADMIN_MENU,
  ADMIN_MENU_SECTION_ORDER,
  AdminMenuItem,
} from './admin-menu.config';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, AppMenuitem, RouterModule],
  templateUrl: './app.menu.html',
})
export class AppMenu {
  private authCaller = inject(AuthCallerService);

  /**
   * Rol del caller resuelto. `null` mientras `AuthCallerService` aún no emite
   * el primer valor (la vista del usuario logueado se carga después del
   * login). En ese intervalo solo se rinden los items con scope
   * `SCOPE_ANY_AUTHENTICATED`, ningún item de rol.
   */
  private caller = toSignal(this.authCaller.currentCaller$, {
    initialValue: null,
  });

  /**
   * Modelo del sidebar agrupado por sección. Filtra `ADMIN_MENU` por el scope
   * del rol del caller (RN-32, RN-40, RN-41) y reagrupa los items que pasan
   * según el orden canónico de `ADMIN_MENU_SECTION_ORDER`. La defensa real
   * corre en `roleGuard` (rutas) y en `ContentScopeService.assertWithinScope`
   * (facades); este filtrado es solo UX.
   */
  model = computed<MenuItem[]>(() => {
    const role = this.caller()?.role;
    const visible = ADMIN_MENU.filter((item) => isVisibleFor(item, role));
    return ADMIN_MENU_SECTION_ORDER
      .map((section) => ({
        label: section,
        items: visible
          .filter((item) => item.section === section)
          .map(toPrimeNgItem),
      }))
      .filter((section) => (section.items?.length ?? 0) > 0);
  });
}

/**
 * Un item es visible si su scope es `SCOPE_ANY_AUTHENTICATED` o si la lista
 * de roles incluye el rol actual. El caller `null` solo deja pasar los
 * universales — ningún item de rol se filtra contra `undefined`.
 */
function isVisibleFor(item: AdminMenuItem, role: UserRole | undefined): boolean {
  if (item.scope === SCOPE_ANY_AUTHENTICATED) {
    return true;
  }
  return role !== undefined && item.scope.includes(role);
}

function toPrimeNgItem(item: AdminMenuItem): MenuItem {
  return {
    label: item.label,
    icon: item.icon,
    routerLink: [item.routerLink],
  };
}
