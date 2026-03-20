import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from '../app.menuitem/app.menuitem';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, AppMenuitem, RouterModule],
  templateUrl: './app.menu.html',
})
export class AppMenu {
  model: MenuItem[] = [];

  ngOnInit() {
    this.model = [
      {
        label: 'Administración',
        items: [
          { label: 'Estadísticas', icon: 'pi pi-fw pi-home', routerLink: ['/administrador/estadisticas'] },
        ],
      },
      {
        label: 'Repositorio',
        items: [
          { label: 'Comunidades', icon: 'pi pi-fw pi-sitemap', routerLink: ['/administrador/comunidades'] },
          { label: 'Colecciones', icon: 'pi pi-fw pi-folder', routerLink: ['/administrador/colecciones'] },
          { label: 'Envíos', icon: 'pi pi-fw pi-upload', routerLink: ['/administrador/envios'] },
        ],
      },
      {
        label: 'Gestión',
        items: [
          { label: 'Usuarios', icon: 'pi pi-fw pi-users', routerLink: ['/administrador/usuarios'] },
          { label: 'Reportes', icon: 'pi pi-fw pi-chart-bar', routerLink: ['/administrador/reportes'] },
        ],
      },
    ];
  }
}
