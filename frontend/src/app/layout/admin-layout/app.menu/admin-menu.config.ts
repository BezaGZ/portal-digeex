import { MenuScope, ROLE_SCOPES } from '../../../core/auth/role-scopes';

/**
 * Definición declarativa de un item del sidebar admin. La sección agrupa los
 * items en el render; el scope decide para qué rol se incluye en el modelo
 * proyectado por `AppMenu`. Cualquier pantalla nueva del panel se agrega
 * extendiendo `ADMIN_MENU` sin tocar el componente.
 */
export interface AdminMenuItem {
  section: 'Administración' | 'Repositorio' | 'Gestión';
  label: string;
  icon: string;
  routerLink: string;
  scope: MenuScope;
}

/**
 * Matriz de visibilidad del sidebar administrativo. El orden de la lista es
 * el orden de render dentro de cada sección. Los scopes vienen de
 * `ROLE_SCOPES` para compartir fuente con `app.routes.ts`.
 */
export const ADMIN_MENU: readonly AdminMenuItem[] = [
  {
    section: 'Administración',
    label: 'Estadísticas',
    icon: 'pi pi-fw pi-home',
    routerLink: '/administrador/estadisticas',
    // El delegado no ve métricas: el dashboard queda para admin de sub y superadmin.
    scope: ROLE_SCOPES.ADMIN,
  },
  {
    section: 'Repositorio',
    label: 'DIGEEX',
    icon: 'pi pi-fw pi-building',
    routerLink: '/administrador/digeex',
    scope: ROLE_SCOPES.SUPERADMIN_ONLY,
  },
  {
    section: 'Repositorio',
    label: 'Subdirecciones',
    icon: 'pi pi-fw pi-sitemap',
    routerLink: '/administrador/subdirecciones',
    scope: ROLE_SCOPES.SUPERADMIN_ONLY,
  },
  {
    section: 'Repositorio',
    label: 'Programas',
    icon: 'pi pi-fw pi-folder',
    routerLink: '/administrador/programas',
    scope: ROLE_SCOPES.ADMIN,
  },
  {
    section: 'Repositorio',
    label: 'Cargar contenido',
    icon: 'pi pi-fw pi-upload',
    routerLink: '/administrador/cargar',
    scope: ROLE_SCOPES.STAFF,
  },
  {
    section: 'Repositorio',
    label: 'Recursos',
    icon: 'pi pi-fw pi-book',
    routerLink: '/administrador/recursos',
    scope: ROLE_SCOPES.ADMIN,
  },
  {
    section: 'Gestión',
    label: 'Usuarios',
    icon: 'pi pi-fw pi-users',
    routerLink: '/administrador/usuarios',
    scope: ROLE_SCOPES.SUPERADMIN_ONLY,
  },
  {
    section: 'Gestión',
    label: 'Estadísticas de uso',
    icon: 'pi pi-fw pi-chart-line',
    routerLink: '/administrador/uso',
    scope: ROLE_SCOPES.ADMIN,
  },
];

/**
 * Orden canónico de las secciones para el render. Se declara explícito en
 * lugar de derivarlo del primer aparición en `ADMIN_MENU` para que reordenar
 * items dentro de una sección no altere el orden de las secciones mismas.
 */
export const ADMIN_MENU_SECTION_ORDER: readonly AdminMenuItem['section'][] = [
  'Administración',
  'Repositorio',
  'Gestión',
];
