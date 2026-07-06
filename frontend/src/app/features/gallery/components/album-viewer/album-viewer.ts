import { Component, OnInit, ChangeDetectionStrategy, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GalleriaModule } from 'primeng/galleria';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { GalleryService } from '../../services/gallery.service';
import { StatisticsTrackingService } from '../../../../core/api/statistics-tracking.service';
import { Album } from '../../models';
import { PhotoGridItemComponent } from '../photo-grid-item/photo-grid-item';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IsoDateLocalPipe } from '../../../../core/i18n/iso-date-local.pipe';

@Component({
  selector: 'app-album-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, GalleriaModule, ButtonModule, SkeletonModule, PhotoGridItemComponent, IsoDateLocalPipe],
  templateUrl: './album-viewer.html',
  styleUrls: ['./album-viewer.scss'],
})
export class AlbumViewer implements OnInit {
  private destroyRef = inject(DestroyRef);

  album = signal<Album | null>(null);
  isLoading = signal(true);
  displayGalleria = signal(false);
  activeIndex = signal(0);

  /**
   * True mientras descarga la foto activa del visor. Al cambiar el src de un
   * <img> ya renderizado el navegador mantiene el frame anterior hasta que la
   * imagen nueva decodifica, así que sin este flag el visor muestra la foto
   * previa como si fuera la actual.
   */
  imageLoading = signal(false);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private galleryService: GalleryService,
    private tracking: StatisticsTrackingService,
  ) {}

  /** UUID de la colección padre, leído del route param `:uuid` de la ruta `/galeria/:uuid/recurso/:id`. */
  private collectionUuid: string | null = null;

  /**
   * Suscribe a `route.params` (no a `route.snapshot`) intencionalmente para
   * que la vista responda a navegaciones entre álbumes vecinos sin remontar
   * el componente: cuando el usuario abre otro álbum desde un link interno
   * que apunta al mismo `AlbumViewer`, Angular reutiliza la instancia y
   * emite un nuevo `params`. La resubscripción dispara `loadAlbum` con el
   * id nuevo y un nuevo `trackView$` para registrar la visita al item.
   */
  ngOnInit() {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.collectionUuid = (params['uuid'] as string | undefined) ?? null;
      const albumId = params['id'];
      if (albumId) {
        this.loadAlbum(albumId);
      } else {
        this.navigateBackToListing();
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
          // Registra la visita al item en Solr Statistics (best-effort).
          this.tracking
            .trackView$(uuid, 'item')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
        } else {
          this.navigateBackToListing();
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.navigateBackToListing();
      },
    });
  }

  goBack() {
    this.navigateBackToListing();
  }

  /** Vuelve al listado de la colección padre si el UUID está presente; si no, al raíz `/galeria`. */
  private navigateBackToListing(): void {
    if (this.collectionUuid) {
      this.router.navigate(['/galeria', this.collectionUuid]);
      return;
    }
    this.router.navigate(['/galeria']);
  }

  openGalleria(index: number) {
    this.activeIndex.set(index);
    this.imageLoading.set(true);
    this.displayGalleria.set(true);
  }

  /** Navegación dentro del visor: la foto entrante empieza en estado de carga. */
  onActiveIndexChange(index: number) {
    this.activeIndex.set(index);
    this.imageLoading.set(true);
  }

  onImageLoad() {
    this.imageLoading.set(false);
  }

  /** El error también apaga el spinner: un 404 no debe dejar el visor colgado. */
  onImageError() {
    this.imageLoading.set(false);
  }

}
