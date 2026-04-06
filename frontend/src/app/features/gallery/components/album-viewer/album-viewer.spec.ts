import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AlbumViewer } from './album-viewer';
import { GalleryService } from '../../services/gallery.service';

/**
 * Tests para AlbumViewer (vista detalle de álbum con grid de fotos).
 *
 * Carga un álbum completo por UUID desde route params,
 * muestra grid de fotos y abre modal PrimeNG Galleria.
 *
 * Ciclo 6 TDD — Sprint 4 (RED).
 */
describe('AlbumViewer', () => {
  let galleryService: GalleryService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlbumViewer],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { params: of({ id: 'album-001' }) },
        },
      ],
    }).compileComponents();

    galleryService = TestBed.inject(GalleryService);
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should extract album id from route params and call getAlbumById', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    fixture.detectChanges();

    expect(fixture.componentInstance.album()).not.toBeNull();
    expect(fixture.componentInstance.album()!.id).toBe('album-001');
  });

  it('should set album signal with loaded data', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    fixture.detectChanges();
    const album = fixture.componentInstance.album();

    expect(album!.title).toBe('Taller PEAC 2025');
    expect(album!.photos.length).toBe(3);
  });

  it('should set isLoading to false after load completes', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    fixture.detectChanges();

    expect(fixture.componentInstance.isLoading()).toBe(false);
  });

  it('should navigate to /galeria when album is not found', () => {
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    const fixture = TestBed.createComponent(AlbumViewer);
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/galeria']);
  });

  it('should open galleria with correct index', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    const component = fixture.componentInstance;

    component.openGalleria(3);

    expect(component.activeIndex()).toBe(3);
    expect(component.displayGalleria()).toBe(true);
  });

  it('should format date in Spanish locale', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    const formatted = fixture.componentInstance.formatDate('2025-03-15');

    expect(formatted).toContain('2025');
  });

  it('should navigate to /galeria on goBack', () => {
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    const fixture = TestBed.createComponent(AlbumViewer);
    fixture.componentInstance.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/galeria']);
  });
});
