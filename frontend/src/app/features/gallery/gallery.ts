import { Component, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { GalleryService, Album, GalleryFilters, FilterOption } from './services/gallery.service';
import { GalleryFiltersComponent } from './gallery-filters/gallery-filters';

@Component({
  selector: 'app-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule, SkeletonModule, GalleryFiltersComponent],
  templateUrl: './gallery.html',
  styles: [
    `
      :host {
        display: block;
      }

      .album-card {
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        height: 100%;
      }

      .album-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 12px 24px -10px rgba(30, 49, 89, 0.3);
      }

      .album-cover {
        width: 100%;
        height: 240px;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .album-card:hover .album-cover {
        transform: scale(1.05);
      }

      .cover-container {
        position: relative;
        overflow: hidden;
        border-radius: 8px 8px 0 0;
      }

      .album-date {
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .album-title {
        font-size: 1.25rem;
        color: var(--gob-azul-gobierno);
        margin-bottom: 8px;
        line-height: 1.3;
        text-align: center;
      }

      .album-description {
        color: var(--color-text-secondary);
        line-height: 1.5;
        margin-bottom: 16px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-align: center;
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

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-GT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
