import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter, distinctUntilChanged, startWith, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
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
export class PublicBreadcrumb implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
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
        distinctUntilChanged(),
        startWith(null),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        const url = this.router.url;
        this.routeItems.set(buildBreadcrumbTrail(this.activatedRoute.root));

        if (!url.startsWith('/programas') && !url.startsWith('/documentos')) {
          this.breadcrumbService.clear();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
