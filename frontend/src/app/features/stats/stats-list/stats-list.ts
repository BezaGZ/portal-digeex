import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';

import { StatsListService } from '../services/stats-list.service';
import { StatisticsTrackingService } from '../../../core/api/statistics-tracking.service';
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
  private readonly route = inject(ActivatedRoute);
  private readonly tracking = inject(StatisticsTrackingService);

  readonly items = signal<readonly StatsItem[]>([]);
  readonly totalRecords = signal(0);
  readonly currentPage = signal(0);
  readonly isLoading = signal(true);
  readonly pageSize = 12;

  /**
   * UUID de la colección activa. Si la ruta es `/estadistica/:uuid`, toma el
   * valor del route param; si es `/estadistica` raíz, se resuelve al primer
   * match de `findByFormat` y se guarda acá para que el tracking y los fetchs
   * de paginación reusen el mismo scope sin volver a resolver. Se modela
   * como signal para que el cambio sea reactivo y observable desde otros
   * computeds o effects.
   */
  readonly collectionUuid = signal<string | null>(null);

  ngOnInit(): void {
    const routeUuid = this.route.snapshot.paramMap.get('uuid');
    if (routeUuid) {
      this.initializeWith(routeUuid);
      return;
    }
    // Sin UUID en la ruta: resolver la primera colección con
    // `dspace.entity.type = 'Estadistica'`, guardarla como scope activo y
    // recién entonces pedir la primera página y registrar la visita. Mantiene
    // bookmarks de `/estadistica` (raíz) funcionando. El handler de error
    // degrada `isLoading` para que el empty state se muestre si el resolver
    // falla (DSpace caído, colección no curada).
    this.service
      .getStatsCollectionUuid$()
      .pipe(take(1))
      .subscribe({
        next: (uuid) => this.initializeWith(uuid),
        error: () => this.isLoading.set(false),
      });
  }

  /**
   * Punto de entrada único tras resolver el UUID de la colección activa.
   * Centraliza el setup (guardar scope, pedir primera página, registrar
   * visita) para que ambas ramas del `ngOnInit` compartan el mismo orden.
   */
  private initializeWith(uuid: string): void {
    this.collectionUuid.set(uuid);
    this.loadPage(0);
    this.tracking.trackView$(uuid, 'collection').subscribe();
  }

  loadPage(page: number): void {
    this.isLoading.set(true);
    this.service.searchStats(page, this.pageSize, this.collectionUuid() ?? undefined).subscribe({
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
    const collectionUuid = this.collectionUuid();
    if (!collectionUuid) {
      this.router.navigate(['/estadistica']);
      return;
    }
    this.router.navigate(['/estadistica', collectionUuid, 'item', uuid]);
  }
}
