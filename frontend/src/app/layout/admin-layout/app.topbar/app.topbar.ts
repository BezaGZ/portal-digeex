import { Component, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { StyleClassModule } from 'primeng/styleclass';
import { LayoutService } from '../services/layout.service';
import { BreadcrumbComponent } from '../app.breadcrumb/app.breadcrumb';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterModule, CommonModule, StyleClassModule, BreadcrumbComponent],
  templateUrl: './app.topbar.html',
})
export class AppTopbar {

  private router = inject(Router);
  userName = 'Administrador';
  userEmail = 'admin@digeex.gob.gt';
  isUserMenuOpen = false;

  @ViewChild('userMenuWrap') userMenuWrap?: ElementRef<HTMLElement>;

  constructor(public layoutService: LayoutService) {}

  toggleDarkMode() {
    this.layoutService.layoutConfig.update((state) => ({
      ...state,
      darkTheme: !state.darkTheme,
    }));
  }

  toggleUserMenu(event: Event) {
    event.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null) {
    const host = this.userMenuWrap?.nativeElement;
    if (!host || !target || host.contains(target as Node)) {
      return;
    }
    this.isUserMenuOpen = false;
  }

  onProfileClick() {
    this.router.navigate(['/administrador/perfil']);
    this.isUserMenuOpen = false;
  }

  onUploadsClick() {
    this.router.navigate(['/administrador/envios']);
    this.isUserMenuOpen = false;
  }

  onLogout() {

    this.isUserMenuOpen = false;
  }
}
