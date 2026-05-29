import { Component, ElementRef, HostListener, ViewChild, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { StyleClassModule } from 'primeng/styleclass';
import { LayoutService } from '../services/layout.service';
import { BreadcrumbComponent } from '../app.breadcrumb/app.breadcrumb';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Texto que se muestra cuando todavia no hay sesion cargada (signal vacia).
 * Se mantiene como constante para evitar literales repetidos en plantilla y
 * componente, y para que el copy se cambie en un solo punto.
 */
const PLACEHOLDER_USER_NAME = 'Usuario';
const PLACEHOLDER_USER_EMAIL = '';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterModule, CommonModule, StyleClassModule, BreadcrumbComponent],
  templateUrl: './app.topbar.html',
})
export class AppTopbar {

  private router = inject(Router);
  private authService = inject(AuthService);
  isUserMenuOpen = false;

  /**
   * Nombre y correo del usuario autenticado. Caen al placeholder cuando la
   * sesion aun no se cargo (caso reload entre ngOnInit y la respuesta de
   * /authn/status).
   */
  readonly userName = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return PLACEHOLDER_USER_NAME;
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    return fullName || PLACEHOLDER_USER_NAME;
  });

  readonly userEmail = computed(() => {
    const user = this.authService.currentUser();
    return user?.email ?? PLACEHOLDER_USER_EMAIL;
  });

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

  /**
   * Cierra la sesion en el backend y manda al login. Misma navegacion en `next`
   * y en `error`: si el POST /authn/logout falla (red caida, token expirado).
   */
  onLogout() {
    this.isUserMenuOpen = false;
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/iniciar-sesion']),
      error: () => this.router.navigate(['/iniciar-sesion']),
    });
  }
}
