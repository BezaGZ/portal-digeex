import { Component, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';
import { GalleryService } from './services/gallery.service';
import { StatisticsTrackingService } from '../../core/api/statistics-tracking.service';
import { Album, GalleryFilters, FilterOption } from './models';
import { GalleryFiltersComponent } from './components/gallery-filters/gallery-filters';
import { AlbumCardComponent } from './components/album-card/album-card';
import { AlbumSkeletonComponent } from './components/album-skeleton/album-skeleton';
import { EmptyStateComponent } from '../../shared';
import { PaginatorEvent } from '../../core/api/models';

@Component({
  selector: 'app-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ButtonModule,
    PaginatorModule,
    GalleryFiltersComponent,
    AlbumCardComponent,
    AlbumSkeletonComponent,
    EmptyStateComponent,
  ],
  templateUrl: './gallery.html',
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class Gallery implements OnInit {
  albums = signal<Album[]>([]);
  isLoading = signal(true);
  totalRecords = signal(0);
  currentPage = signal(0);
  readonly pageSize = 6;

  /**
   * UUID de la colección activa. Si la ruta es `/galeria/:uuid`, toma el
   * valor del route param; si es `/galeria` raíz, se resuelve al primer
   * match de `findByFormat` y se guarda acá para que el tracking y los
   * fetchs de paginación reusen el mismo scope sin volver a resolver.
   * Se modela como signal para que cualquier consumidor que dependa del
   * scope (template, computed, effect) reaccione al cambio explícito.
   */
  readonly collectionUuid = signal<string | null>(null);

  programOptions = signal<FilterOption[]>([]);
  eventTypeOptions = signal<FilterOption[]>([]);
  populationTypeOptions = signal<FilterOption[]>([]);
  imageContextOptions = signal<FilterOption[]>([]);
  currentFilters: GalleryFilters = {};

  constructor(
    private galleryService: GalleryService,
    private router: Router,
    private route: ActivatedRoute,
    private tracking: StatisticsTrackingService,
  ) {}

  ngOnInit() {
    const routeUuid = this.route.snapshot.paramMap.get('uuid');
    if (routeUuid) {
      this.initializeWith(routeUuid);
      return;
    }
    // Sin UUID en la ruta: resolver la primera colección con
    // `dspace.entity.type = 'Galeria'`, guardarla como scope activo y
    // recién entonces cargar filtros, álbumes y registrar la visita. Mantiene
    // funcional la ruta raíz `/galeria` para bookmarks y enlaces internos.
    // El handler de error degrada `isLoading` para que el empty state se
    // muestre si el resolver falla (DSpace caído, colección no curada).
    this.galleryService
      .getGalleryCollectionUuid$()
      .pipe(take(1))
      .subscribe({
        next: (uuid) => this.initializeWith(uuid),
        error: () => this.isLoading.set(false),
      });
  }

  /**
   * Punto de entrada único tras resolver el UUID de la colección activa.
   * Centraliza el setup (guardar scope, cargar filtros, cargar primera
   * página, registrar visita) para que ambas ramas del `ngOnInit`
   * compartan exactamente el mismo orden de inicialización.
   */
  private initializeWith(uuid: string): void {
    this.collectionUuid.set(uuid);
    this.loadFilterOptions();
    this.loadAlbums();
    this.tracking.trackView$(uuid, 'collection').subscribe();
  }

  loadFilterOptions() {
    this.galleryService.getFilterOptions(this.collectionUuid() ?? undefined).subscribe({
      next: (options) => {
        this.programOptions.set(options.programs);
        this.eventTypeOptions.set(options.eventTypes);
        this.populationTypeOptions.set(options.populationTypes);
        this.imageContextOptions.set(options.imageContexts);
      },
    });
  }

  loadAlbums(filters: GalleryFilters = {}, page = 0) {
    this.isLoading.set(true);
    this.currentFilters = filters;

    this.galleryService.searchAlbums(filters, page, this.pageSize, this.collectionUuid() ?? undefined).subscribe({
      next: (result) => {
        this.albums.set(result.albums);
        this.totalRecords.set(result.totalElements);
        this.currentPage.set(result.page);
        this.isLoading.set(false);
      },
      error: () => {
        this.albums.set([]);
        this.totalRecords.set(0);
        this.isLoading.set(false);
      },
    });
  }

  onFiltersChange(filters: GalleryFilters) {
    this.loadAlbums(filters, 0);
  }

  onClearFilters() {
    this.loadAlbums({}, 0);
  }

  onPageChange(event: PaginatorEvent) {
    const page = event.page ?? 0;
    this.loadAlbums(this.currentFilters, page);
  }

  openAlbum(album: Album) {
    const uuid = this.collectionUuid();
    if (!uuid) {
      this.router.navigate(['/galeria']);
      return;
    }
    this.router.navigate(['/galeria', uuid, 'album', album.id]);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
