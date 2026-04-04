import { Component, OnInit, ChangeDetectionStrategy, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GalleriaModule } from 'primeng/galleria';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { GalleryService } from '../../services/gallery.service';
import { Album } from '../../models';
import { PhotoGridItemComponent } from '../photo-grid-item/photo-grid-item';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-album-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, GalleriaModule, ButtonModule, SkeletonModule, PhotoGridItemComponent],
  templateUrl: './album-viewer.html',
  styleUrls: ['./album-viewer.scss'],
})
export class AlbumViewer implements OnInit {
  private destroyRef = inject(DestroyRef);

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
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const albumId = params['id'];
      if (albumId) {
        this.loadAlbum(albumId);
      } else {
        this.router.navigate(['/galeria']);
      }
    });
  }

  private loadAlbum(uuid: string) {
    this.isLoading.set(true);

    this.galleryService.getAlbumById(uuid).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (album) => {
        if (album) {
          this.album.set(album);
        } else {
          this.router.navigate(['/galeria']);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.router.navigate(['/galeria']);
      },
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
}
