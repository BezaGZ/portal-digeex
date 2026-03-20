import { Component, signal, HostListener } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { Menu } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-public-header',
  standalone: true,
  imports: [RouterModule, ButtonModule, CommonModule, Menu],
  templateUrl: './public-header.html',
  styleUrls: ['./public-header.scss'],
})
export class PublicHeader {
  mobileOpen = signal(false);
  menuVisible = false;

  menuItems: MenuItem[] = [
    { label: 'Galería Institucional', icon: 'pi pi-images', routerLink: '/galeria' },
  ];

  constructor(private router: Router) {}

  toggleMobileMenu() {
    this.mobileOpen.update((v) => !v);
  }
  closeMobileMenu() {
    this.mobileOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeMobileMenu();
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
  goToSearch() {
    this.router.navigate(['/busqueda-avanzada']);
  }
}
