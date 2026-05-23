import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';

import { StatsListService } from '../services/stats-list.service';
import { StatsItem } from '../models/stats-item.model';
import { StatsCardComponent } from '../components/stats-card/stats-card';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared';
import { PaginatorEvent } from '../../../core/api/models';

/**
 * Listado público de Estadística (`/estadistica`). Pide la primera página al
 * service en init, renderiza las cards en un grid y delega la navegación al
 * detalle al click. Sin filtros locales: el listado muestra todos los items
 * publicados por DIGEEX para que cualquier dataset nuevo aparezca solo en
 * el archivo + colección, sin tocar el frontend.
 */
@Component({
  selector: 'app-stats-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ButtonModule,
    PaginatorModule,
    StatsCardComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './stats-list.html',
})
export class StatsList implements OnInit {
  private readonly service = inject(StatsListService);
  private readonly router = inject(Router);

  readonly items = signal<readonly StatsItem[]>([]);
  readonly totalRecords = signal(0);
  readonly currentPage = signal(0);
  readonly isLoading = signal(true);
  readonly pageSize = 12;

  ngOnInit(): void {
    this.loadPage(0);
  }

  loadPage(page: number): void {
    this.isLoading.set(true);
    this.service.searchStats(page, this.pageSize).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.totalRecords.set(result.totalElements);
        this.currentPage.set(result.page);
        this.isLoading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.totalRecords.set(0);
        this.isLoading.set(false);
      },
    });
  }

  onPageChange(ev: PaginatorEvent): void {
    this.loadPage(ev.page ?? 0);
  }

  openItem(uuid: string): void {
    this.router.navigate(['/estadistica', uuid]);
  }
}
