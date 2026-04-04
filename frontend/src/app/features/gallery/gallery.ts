import { Component, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';
import { GalleryService } from './services/gallery.service';
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

  programOptions = signal<FilterOption[]>([]);
  eventTypeOptions = signal<FilterOption[]>([]);
  populationTypeOptions = signal<FilterOption[]>([]);
  imageContextOptions = signal<FilterOption[]>([]);
  currentFilters: GalleryFilters = {};

  constructor(
    private galleryService: GalleryService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadFilterOptions();
    this.loadAlbums();
  }

  loadFilterOptions() {
    this.galleryService.getFilterOptions().subscribe({
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

    this.galleryService.searchAlbums(filters, page, this.pageSize).subscribe({
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
    this.router.navigate(['/galeria', album.id]);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
