import { Component, signal, HostListener, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'primeng/api';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { getCollectionRoute } from '../../../core/config/collection-format.config';
import { NAV_LOCATION, ENTITY_TYPE } from '../../../core/config/digeex-values.config';

@Component({
  selector: 'app-public-header',
  standalone: true,
  imports: [RouterModule, ButtonModule, CommonModule, Popover],
  templateUrl: './public-header.html',
  styleUrls: ['./public-header.scss'],
})
export class PublicHeader implements OnInit {
  mobileOpen = signal(false);
  menuError = signal(false);

  menuItems: MenuItem[] = [];

  constructor(
    private router: Router,
    private collectionCache: CollectionCacheService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadSecondaryMenu();
  }

  loadSecondaryMenu() {
    this.menuError.set(false);
    this.collectionCache.getByMenuType(NAV_LOCATION.MENU_SECUNDARIO).subscribe({
      next: (menuCollections) => {
        this.menuItems = [];
        menuCollections.forEach((collection, index) => {
          const format = collection.metadata?.['dspace.entity.type']?.[0]?.value || ENTITY_TYPE.DOCUMENTO;

          this.menuItems.push({
            label: collection.name,
            routerLink: getCollectionRoute(format, collection.uuid)
          });

          if (index < menuCollections.length - 1) {
            this.menuItems.push({ separator: true });
          }
        });

        this.cdr.markForCheck();
      },
      error: () => {
        this.menuError.set(true);
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Reintenta la carga del menú secundario tras un fallo.
   * invalidate() es obligatorio: el cache deja el error cacheado con shareReplay,
   * así que sin limpiarlo el reintento repetiría el error sin consultar al backend.
   */
  retryMenu() {
    this.collectionCache.invalidate();
    this.loadSecondaryMenu();
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
    this.router.navigate(['/iniciar-sesion']);
  }
  goToSearch() {
    this.router.navigate(['/busqueda-avanzada']);
  }
}
