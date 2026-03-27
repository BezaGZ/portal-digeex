import { Component, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { GalleryService, Album, GalleryFilters, FilterOption } from './services/gallery.service';
import { GalleryFiltersComponent } from './gallery-filters/gallery-filters';
import { AlbumCardComponent } from '../../shared';

@Component({
  selector: 'app-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule, SkeletonModule, GalleryFiltersComponent, AlbumCardComponent],
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
  programOptions = signal<FilterOption[]>([]);
  eventTypeOptions = signal<FilterOption[]>([]);
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
      },
    });
  }

  loadAlbums(filters: GalleryFilters = {}) {
    this.isLoading.set(true);
    this.currentFilters = filters;

    this.galleryService.searchAlbums(filters).subscribe({
      next: (albums) => {
        this.albums.set(albums);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  onFiltersChange(filters: GalleryFilters) {
    this.loadAlbums(filters);
  }

  onClearFilters() {
    this.loadAlbums({});
  }

  openAlbum(album: Album) {
    this.router.navigate(['/galeria', album.id]);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
