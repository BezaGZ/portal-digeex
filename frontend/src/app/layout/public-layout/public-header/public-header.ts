import { ChangeDetectionStrategy, Component, ElementRef, signal, HostListener, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'primeng/api';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { getCollectionRoute } from '../../../core/config/collection-format.config';
import { NAV_LOCATION, ENTITY_TYPE } from '../../../core/config/digeex-values.config';

/**
 * Píxeles de scroll a partir de los que el header gana sombra. Umbral chico
 * para que no titile con el rebote elástico de iOS cerca del tope.
 */
const SCROLL_ELEVATION_THRESHOLD = 8;

@Component({
  selector: 'app-public-header',
  standalone: true,
  imports: [RouterModule, ButtonModule, CommonModule, Popover],
  templateUrl: './public-header.html',
  styleUrls: ['./public-header.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicHeader implements OnInit {
  mobileOpen = signal(false);
  menuError = signal(false);

  /** True al despegarse del tope; el template le da sombra al header (elevación). */
  readonly scrolled = signal(false);

  /** Coalesce los eventos de scroll a un frame para no recalcular de más. */
  private scrollTicking = false;

  /** Ítems del menú secundario. Signal para que OnPush refresque al cargarlos. */
  readonly menuItems = signal<MenuItem[]>([]);

  constructor(
    private router: Router,
    private collectionCache: CollectionCacheService,
    private readonly el: ElementRef<HTMLElement>,
  ) {}

  ngOnInit() {
    this.loadSecondaryMenu();
  }

  loadSecondaryMenu() {
    this.menuError.set(false);
    this.collectionCache.getByMenuType(NAV_LOCATION.MENU_SECUNDARIO).subscribe({
      next: (menuCollections) => {
        const items: MenuItem[] = [];
        menuCollections.forEach((collection, index) => {
          const format = collection.metadata?.['dspace.entity.type']?.[0]?.value || ENTITY_TYPE.DOCUMENTO;

          items.push({
            label: collection.name,
            routerLink: getCollectionRoute(format, collection.uuid),
          });

          if (index < menuCollections.length - 1) {
            items.push({ separator: true });
          }
        });

        this.menuItems.set(items);
      },
      error: () => {
        this.menuError.set(true);
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

  /**
   * Cierra el menú móvil al hacer click fuera del header. El click del propio
   * botón hamburguesa cae dentro del host, así que abrirlo no lo cierra en el
   * mismo evento; los ítems ya cierran por su cuenta al navegar.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.mobileOpen() && !this.el.nativeElement.contains(event.target as Node)) {
      this.closeMobileMenu();
    }
  }

  /** Lee la posición de scroll una vez por frame y ajusta la elevación del header. */
  @HostListener('window:scroll')
  onWindowScroll() {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.onScroll(window.scrollY);
      this.scrollTicking = false;
    });
  }

  /**
   * Prende la sombra del header al despegarse del tope. Recibe la posición por
   * parámetro en vez de leer `window` para no acoplar la decisión al scroll global.
   */
  onScroll(currentY: number) {
    this.scrolled.set(currentY > SCROLL_ELEVATION_THRESHOLD);
  }

  goToLogin() {
    this.router.navigate(['/iniciar-sesion']);
  }
  goToSearch() {
    this.router.navigate(['/busqueda-avanzada']);
  }
}
