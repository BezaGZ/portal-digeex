import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';

import { StatsListService } from '../services/stats-list.service';
import { StatisticsTrackingService } from '../../../core/api/statistics-tracking.service';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { Collection } from '../../../core/api/models/collection.model';
import { StatsItem } from '../models/stats-item.model';
import { StatsCardComponent } from '../components/stats-card/stats-card';
import { StatsCardSkeletonComponent } from '../components/stats-card-skeleton/stats-card-skeleton';
import { EmptyState } from '../../../shared';
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
    StatsCardSkeletonComponent,
    EmptyState,
  ],
  templateUrl: './stats-list.html',
})
export class StatsList implements OnInit {
  private readonly service = inject(StatsListService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly tracking = inject(StatisticsTrackingService);
  private readonly collectionCache = inject(CollectionCacheService);

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

  /**
   * Colección Estadistica completa, resuelta del cache para el header. Si el
   * lookup falla queda en null y los computed degradan a los textos
   * estáticos; el listado no depende de este dato.
   */
  readonly collection = signal<Collection | null>(null);

  readonly headerTitle = computed(
    () => this.collection()?.metadata?.['dc.title']?.[0]?.value || 'Estadística',
  );

  readonly headerDescription = computed(
    () =>
      this.collection()?.metadata?.['dc.description']?.[0]?.value ||
      'Dashboards interactivos con los datos abiertos publicados por DIGEEX. Hacé clic en una card para abrir su tablero.',
  );

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
    this.loadHeaderCollection(uuid);
    this.loadPage(0);
    this.tracking.trackView$(uuid, 'collection').subscribe();
  }

  /**
   * Resuelve la colección completa del cache para el header (dc.title y
   * dc.description). Best-effort: en error se ignora y el header conserva
   * los textos estáticos de fallback. Mismo patrón que Gallery.
   */
  private loadHeaderCollection(uuid: string): void {
    this.collectionCache
      .findCollectionByUuid(uuid)
      .pipe(take(1))
      .subscribe({
        next: (collection) => this.collection.set(collection),
        error: () => this.collection.set(null),
      });
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
    this.router.navigate(['/estadistica', collectionUuid, 'recurso', uuid]);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
