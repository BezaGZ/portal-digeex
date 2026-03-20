import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter, distinctUntilChanged, startWith, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { MenuItem } from 'primeng/api';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';

@Component({
  selector: 'app-public-breadcrumb',
  standalone: true,
  imports: [BreadcrumbModule],
  templateUrl: './public-breadcrumb.html',
})
export class PublicBreadcrumb implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  home: MenuItem = { icon: 'pi pi-home', routerLink: '/', label: 'Inicio' };

  private routeItems = signal<MenuItem[]>([]);

  displayItems = computed(() => {
    const route = this.routeItems();
    return route.length > 0 ? route : this.breadcrumbService.trail();
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
        distinctUntilChanged(),
        startWith(null),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        const url = this.router.url;
        const items = this.buildBreadCrumb(this.activatedRoute.root);
        this.routeItems.set(items);

        if (!url.startsWith('/programas') && !url.startsWith('/documentos')) {
          this.breadcrumbService.clear();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildBreadCrumb(
    route: ActivatedRoute,
    url: string = '',
    breadcrumbs: MenuItem[] = [],
  ): MenuItem[] {
    const path = route.routeConfig?.path || '';
    const breadcrumbLabel = route.routeConfig?.data?.['breadcrumb'];
    const routeParams = route.snapshot.params;

    let resolvedPath = path;
    for (const key in routeParams) {
      if (Object.prototype.hasOwnProperty.call(routeParams, key)) {
        resolvedPath = resolvedPath.replace(`:${key}`, routeParams[key]);
      }
    }

    const nextUrl = path ? `${url}/${resolvedPath}` : url;

    if (breadcrumbLabel) {
      const label =
        typeof breadcrumbLabel === 'function'
          ? breadcrumbLabel(route.snapshot.data)
          : breadcrumbLabel;
      breadcrumbs.push({ label, routerLink: nextUrl });
    }

    if (route.firstChild) {
      return this.buildBreadCrumb(route.firstChild, nextUrl, breadcrumbs);
    }

    return breadcrumbs.filter(
      (item, index, self) => index === self.findIndex((t) => t.label === item.label),
    );
  }
}
