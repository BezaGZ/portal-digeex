import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MenuItem } from 'primeng/api';
import { ActivatedRoute, Router, NavigationEnd, RouterLink } from '@angular/router';
import { filter, distinctUntilChanged, startWith } from 'rxjs/operators';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { CommonModule } from '@angular/common';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { buildBreadcrumbTrail } from '../../../core/breadcrumb/breadcrumb.util';

/**
 * Raíz fija del trail admin. Las páginas de detalle publican su trail sin
 * incluirla ([sección, nombre real]); el componente la antepone para que
 * el resultado quede parejo con los trails derivados de rutas.
 */
const ADMIN_ROOT: MenuItem = { label: 'Administrador', routerLink: '/administrador' };

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [RouterLink, BreadcrumbModule, CommonModule],
  templateUrl: './app.breadcrumb.html',
})
export class BreadcrumbComponent {
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private breadcrumbService = inject(BreadcrumbService);

  home: MenuItem = { icon: 'pi pi-home', routerLink: '/administrador/estadisticas' };

  private routeItems = signal<MenuItem[]>([]);

  /**
   * El trail publicado por la página activa (nombre real del recurso) tiene
   * prioridad; sin publicación se usa el derivado de `data.breadcrumb`.
   * Mismo contrato que PublicBreadcrumb.
   */
  displayItems = computed(() => {
    const serviceTrail = this.breadcrumbService.trail();
    return serviceTrail.length > 0 ? [ADMIN_ROOT, ...serviceTrail] : this.routeItems();
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged(),
        startWith(null),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.routeItems.set(buildBreadcrumbTrail(this.activatedRoute.root));
        // Solo en navegación real (no en el arranque): la página entrante
        // republica su trail al resolver datos; uno viejo no debe sobrevivir.
        if (event !== null) this.breadcrumbService.clear();
      });
  }
}
