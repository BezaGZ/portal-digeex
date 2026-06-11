import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter, startWith } from 'rxjs/operators';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { MenuItem } from 'primeng/api';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { buildBreadcrumbTrail } from '../../../core/breadcrumb/breadcrumb.util';

@Component({
  selector: 'app-public-breadcrumb',
  standalone: true,
  imports: [BreadcrumbModule],
  templateUrl: './public-breadcrumb.html',
})
export class PublicBreadcrumb implements OnInit {
  private destroyRef = inject(DestroyRef);

  home: MenuItem = { icon: 'pi pi-home', routerLink: '/', label: 'Inicio' };

  private routeItems = signal<MenuItem[]>([]);

  displayItems = computed(() => {
    const serviceTrail = this.breadcrumbService.trail();
    return serviceTrail.length > 0 ? serviceTrail : this.routeItems();
  });

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private breadcrumbService: BreadcrumbService,
  ) {}

  ngOnInit() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        const url = this.router.url;
        this.routeItems.set(buildBreadcrumbTrail(this.activatedRoute.root));

        if (!url.startsWith('/programas') && !url.startsWith('/documentos')) {
          this.breadcrumbService.clear();
        }
      });
  }
}
