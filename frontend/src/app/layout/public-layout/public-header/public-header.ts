import { Component, signal, HostListener, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { Menu } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { getCollectionRoute } from '../../../core/config/collection-format.config';

@Component({
  selector: 'app-public-header',
  standalone: true,
  imports: [RouterModule, ButtonModule, CommonModule, Menu],
  templateUrl: './public-header.html',
  styleUrls: ['./public-header.scss'],
})
export class PublicHeader implements OnInit {
  mobileOpen = signal(false);
  menuVisible = false;

  menuItems: MenuItem[] = [];

  constructor(
    private router: Router,
    private dspaceApi: DSpaceApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadSecondaryMenu();
  }

  loadSecondaryMenu() {
    this.dspaceApi.getAllCollections(0, 100).subscribe({
      next: (response) => {
        const collections = response._embedded?.['collections'] || [];

        const secondaryMenuCollections = collections.filter((collection) => {
          const type = collection.metadata?.['dc.type']?.[0]?.value;
          return type === 'menu-secundario';
        });

        secondaryMenuCollections.sort((a, b) => {
          const orderA = parseInt(a.metadata?.['dc.identifier.other']?.[0]?.value || '999');
          const orderB = parseInt(b.metadata?.['dc.identifier.other']?.[0]?.value || '999');
          return orderA - orderB;
        });

        this.menuItems = [];
        secondaryMenuCollections.forEach((collection, index) => {
          const format = collection.metadata?.['dc.format']?.[0]?.value || 'documento';

          this.menuItems.push({
            label: collection.metadata?.['dc.subject']?.[0]?.value || collection.name,
            routerLink: getCollectionRoute(format, collection.uuid)
          });

          if (index < secondaryMenuCollections.length - 1) {
            this.menuItems.push({ separator: true });
          }
        });

        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar menú secundario desde DSpace:', error);
        this.cdr.markForCheck();
      },
    });
  }

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
