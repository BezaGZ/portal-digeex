import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GalleriaModule } from 'primeng/galleria';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { GalleryService, Album } from './services/gallery.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-album-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, GalleriaModule, ButtonModule, SkeletonModule],
  templateUrl: './album-viewer.html',
  styles: [
    `
      :host {
        display: block;
      }

      .photo-grid-item {
        position: relative;
        overflow: hidden;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
        border: 2px solid transparent;
      }

      .photo-grid-item:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(30, 49, 89, 0.2);
        border-color: var(--gob-azul-gobierno);
      }

      .photo-grid-item img {
        width: 100%;
        height: 300px;
        object-fit: cover;
        border-radius: 8px;
      }
    `,
  ],
})
export class AlbumViewer implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  album = signal<Album | null>(null);
  isLoading = signal(true);
  displayGalleria = signal(false);
  activeIndex = signal(0);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private galleryService: GalleryService,
  ) {}

  ngOnInit() {
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      const album = data['album'];
      if (album) {
        this.album.set(album);
        this.isLoading.set(false);
      } else {
        this.router.navigate(['/galeria']);
      }
    });
  }

  goBack() {
    this.router.navigate(['/galeria']);
  }

  openGalleria(index: number) {
    this.activeIndex.set(index);
    this.displayGalleria.set(true);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-GT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
