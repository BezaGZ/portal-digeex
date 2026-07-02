import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AlbumViewer } from './album-viewer';
import { GalleryService } from '../../services/gallery.service';
import { Album } from '../../models';

/**
 * Tests para AlbumViewer (vista detalle de álbum con grid de fotos).
 *
 * Carga un álbum completo por UUID desde route params,
 * muestra grid de fotos y abre modal PrimeNG Galleria.
 *
 * Ciclo 6 TDD — Sprint 4. Ajustado en Ciclo 26 (Sprint 8) y Ciclos 48 y 51
 * (Sprint 10).
 */
describe('AlbumViewer', () => {
  let galleryService: GalleryService;
  let router: Router;

  /** Fixtures */

  const MOCK_ALBUM: Album = {
    id: 'album-001',
    title: 'Taller PEAC 2025',
    description: 'Fotografías del taller.',
    date: '2025-03-15',
    coverPhoto: '/server/api/core/bitstreams/thumb-001/content',
    photos: [
      { id: 'photo-1', url: '/server/api/core/bitstreams/p1/content', thumbnailUrl: '/server/api/core/bitstreams/p1/content' },
      { id: 'photo-2', url: '/server/api/core/bitstreams/p2/content', thumbnailUrl: '/server/api/core/bitstreams/p2/content' },
      { id: 'photo-3', url: '/server/api/core/bitstreams/p3/content', thumbnailUrl: '/server/api/core/bitstreams/p3/content' },
    ],
    program: 'PEAC',
    subjects: ['Educación'],
    eventType: 'Taller',
    author: 'DIGEEX',
    publisher: 'MINEDUC',
    populationType: 'Jóvenes',
    imageContext: 'Grupal',
    photoCount: 3,
    videos: [],
  };

  /** Setup */

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlbumViewer],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { params: of({ uuid: 'col-galeria', id: 'album-001' }) },
        },
      ],
    }).compileComponents();

    galleryService = TestBed.inject(GalleryService);
    router = TestBed.inject(Router);

    vi.spyOn(galleryService, 'getAlbumById').mockReturnValue(of(MOCK_ALBUM));
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should create', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    expect(fixture.componentInstance).toBeTruthy();
  });

  /** Carga de álbum */

  describe('album loading', () => {
    /** Verifica que extraiga el id del álbum de la ruta y llame a getAlbumById. */
    it('should extract album id from route params and call getAlbumById', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      fixture.detectChanges();

      expect(galleryService.getAlbumById).toHaveBeenCalledWith('album-001');
      expect(fixture.componentInstance.album()).not.toBeNull();
      expect(fixture.componentInstance.album()!.id).toBe('album-001');
    });

    /** Verifica que el signal album se actualice con los datos cargados. */
    it('should set album signal with loaded data', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      fixture.detectChanges();
      const album = fixture.componentInstance.album();

      expect(album!.title).toBe('Taller PEAC 2025');
      expect(album!.photos.length).toBe(3);
    });

    /** Verifica que isLoading sea false después de completar la carga. */
    it('should set isLoading to false after load completes', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      fixture.detectChanges();

      expect(fixture.componentInstance.isLoading()).toBe(false);
    });

    /** Verifica que navegue al listado de la colección padre cuando el álbum no se encuentra. */
    it('should navigate to /galeria/:collectionUuid when album is not found', () => {
      vi.spyOn(galleryService, 'getAlbumById').mockReturnValue(of(undefined));

      const fixture = TestBed.createComponent(AlbumViewer);
      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/galeria', 'col-galeria']);
    });
  });

  /** Sección de videos */

  describe('videos section', () => {
    /** Verifica que con videos en el álbum se renderice la sección con un player nativo por video. */
    it('should render a native video player per album video', () => {
      vi.spyOn(galleryService, 'getAlbumById').mockReturnValue(
        of({
          ...MOCK_ALBUM,
          videos: [
            { id: 'v1', url: '/server/api/core/bitstreams/v1/content', name: 'clip-01.mp4' },
            { id: 'v2', url: '/server/api/core/bitstreams/v2/content', name: 'clip-02.webm' },
          ],
        }),
      );

      const fixture = TestBed.createComponent(AlbumViewer);
      fixture.detectChanges();

      const section = fixture.nativeElement.querySelector('[data-testid="album-videos-section"]');
      expect(section).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('video').length).toBe(2);
    });

    /** Verifica que sin videos la sección no exista y el visor quede como siempre. */
    it('should not render the videos section when the album has no videos', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="album-videos-section"]')).toBeFalsy();
      expect(fixture.nativeElement.querySelectorAll('video').length).toBe(0);
    });
  });

  /** Galleria modal y utilidades */

  describe('galleria and utilities', () => {
    /** Verifica que openGalleria() establezca el índice activo y muestre la galleria. */
    it('should open galleria with correct index', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      const component = fixture.componentInstance;

      component.openGalleria(3);

      expect(component.activeIndex()).toBe(3);
      expect(component.displayGalleria()).toBe(true);
    });

    /** Verifica que abrir el visor marque la foto activa como cargando. */
    it('should flag the active photo as loading when the galleria opens', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      const component = fixture.componentInstance;

      component.openGalleria(1);

      expect(component.imageLoading()).toBe(true);
    });

    /** Verifica que navegar a otra foto marque la nueva como cargando. */
    it('should flag the new photo as loading when the active index changes', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      const component = fixture.componentInstance;

      component.onActiveIndexChange(2);

      expect(component.activeIndex()).toBe(2);
      expect(component.imageLoading()).toBe(true);
    });

    /** Verifica que el estado de carga termine cuando la foto activa descarga. */
    it('should clear the loading flag when the active photo finishes loading', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      const component = fixture.componentInstance;
      component.openGalleria(1);

      component.onImageLoad();

      expect(component.imageLoading()).toBe(false);
    });

    /** Verifica que una foto que falla no deje el visor colgado en cargando. */
    it('should clear the loading flag when the active photo fails to load', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      const component = fixture.componentInstance;
      component.openGalleria(1);

      component.onImageError();

      expect(component.imageLoading()).toBe(false);
    });

    /** Verifica que goBack() navegue al listado de la colección padre. */
    it('should navigate to /galeria/:collectionUuid on goBack', () => {
      const fixture = TestBed.createComponent(AlbumViewer);
      fixture.detectChanges();
      fixture.componentInstance.goBack();

      expect(router.navigate).toHaveBeenCalledWith(['/galeria', 'col-galeria']);
    });
  });
});
