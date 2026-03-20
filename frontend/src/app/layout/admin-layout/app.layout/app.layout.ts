import { Component, OnDestroy, Renderer2, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';
import { AppTopbar } from '../app.topbar/app.topbar';
import { AppSidebar } from '../app.sidebar/app.sidebar';
import { AppFooter } from '../app.footer/app.footer';
import { LayoutService } from '../services/layout.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, AppTopbar, AppSidebar, RouterModule, AppFooter],
  templateUrl: './app.layout.html',
})
export class AppLayout implements OnDestroy {
  private destroy$ = new Subject<void>();

  menuOutsideClickListener: (() => void) | null = null;

  @ViewChild(AppSidebar) appSidebar!: AppSidebar;

  @ViewChild(AppTopbar) appTopBar!: AppTopbar;

  constructor(
    public layoutService: LayoutService,
    public renderer: Renderer2,
    public router: Router
  ) {
    this.layoutService.overlayOpen$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (!this.menuOutsideClickListener) {
        this.menuOutsideClickListener = this.renderer.listen('document', 'click', (event) => {
          if (this.isOutsideClicked(event)) {
            this.hideMenu();
          }
        });
      }

      if (this.layoutService.layoutState().staticMenuMobileActive) {
        this.blockBodyScroll();
      }
    });

    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.hideMenu();
    });
  }

  blockBodyScroll(): void {
    if (document.body.classList) {
      document.body.classList.add('blocked-scroll');
    } else {
      document.body.className += ' blocked-scroll';
    }
  }

  unblockBodyScroll(): void {
    if (document.body.classList) {
      document.body.classList.remove('blocked-scroll');
    } else {
      document.body.className = document.body.className.replace(
        new RegExp('(^|\\b)' + 'blocked-scroll'.split(' ').join('|') + '(\\b|$)', 'gi'),
        ' '
      );
    }
  }

  get containerClass() {
    return {
      'layout-overlay': this.layoutService.layoutConfig().menuMode === 'overlay',
      'layout-static': this.layoutService.layoutConfig().menuMode === 'static',
      'layout-static-inactive':
        this.layoutService.layoutState().staticMenuDesktopInactive &&
        this.layoutService.layoutConfig().menuMode === 'static',
      'layout-overlay-active': this.layoutService.layoutState().overlayMenuActive,
      'layout-mobile-active': this.layoutService.layoutState().staticMenuMobileActive,
    };
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.menuOutsideClickListener) {
      this.menuOutsideClickListener();
    }
  }

  isOutsideClicked(event: MouseEvent) {
    const sidebarEl = document.querySelector('.layout-sidebar');
    const topbarEl = document.querySelector('.layout-menu-button');
    const configuratorEl = document.querySelector('.layout-config-menu');
    const profileMenuEl = document.querySelector('.layout-topbar-menu');
    const eventTarget = event.target as Node;

    return !(
      sidebarEl?.contains(eventTarget) ||
      topbarEl?.contains(eventTarget) ||
      configuratorEl?.contains(eventTarget) ||
      profileMenuEl?.contains(eventTarget)
    );
  }

  hideMenu() {

    this.layoutService.layoutState.update((prev) => ({
      ...prev,
      overlayMenuActive: false,
      staticMenuMobileActive: false,
      menuHoverActive: false,
    }));

    this.layoutService.closeAllMenus();

    if (this.menuOutsideClickListener) {
      this.menuOutsideClickListener();
      this.menuOutsideClickListener = null;
    }
    this.unblockBodyScroll();
  }
}
