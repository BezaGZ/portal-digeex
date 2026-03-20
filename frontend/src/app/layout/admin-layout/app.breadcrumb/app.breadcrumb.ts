import { Component, OnInit, OnDestroy } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { ActivatedRoute, Router, NavigationEnd, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, distinctUntilChanged, map, startWith, takeUntil } from 'rxjs/operators';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [RouterLink, BreadcrumbModule, CommonModule],
  templateUrl: './app.breadcrumb.html',
})
export class BreadcrumbComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  items: MenuItem[] = [];
  home: MenuItem = { icon: 'pi pi-home', routerLink: '/administrador/estadisticas' };

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged(),
        startWith(null),
        map(() => {

          return this.buildBreadCrumb(this.activatedRoute.root);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((breadcrumbs) => {
        this.items = breadcrumbs;
      });

    this.items = this.buildBreadCrumb(this.activatedRoute.root);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  buildBreadCrumb(
    route: ActivatedRoute,
    url: string = '',
    breadcrumbs: MenuItem[] = []
  ): MenuItem[] {

    const path = route.routeConfig?.path || '';
    const breadcrumbLabel = route.routeConfig?.data?.['breadcrumb'];

    const routeParams = route.snapshot.params;
    let resolvedPath = path;

    for (const key in routeParams) {
      if (routeParams.hasOwnProperty(key)) {
        resolvedPath = resolvedPath.replace(`:${key}`, routeParams[key]);
      }
    }

    const nextUrl = path ? `${url}/${resolvedPath}` : url;

    if (breadcrumbLabel) {

      const label =
        typeof breadcrumbLabel === 'function'
          ? breadcrumbLabel(route.snapshot.data)
          : breadcrumbLabel;

      const breadcrumbItem: MenuItem = {
        label: label,
        routerLink: nextUrl,
      };
      breadcrumbs.push(breadcrumbItem);
    }

    if (route.firstChild) {
      return this.buildBreadCrumb(route.firstChild, nextUrl, breadcrumbs);
    }

    return breadcrumbs.filter(
      (item, index, self) => index === self.findIndex((t) => t.label === item.label)
    );
  }
}
