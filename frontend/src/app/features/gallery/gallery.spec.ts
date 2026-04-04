import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Gallery } from './gallery';
import { GalleryService } from './services/gallery.service';
import { AlbumPage, FilterOptions } from './models';

/**
 * Tests TDD para Gallery (componente principal de galería).
 * Sprint 4 - Ciclo extra.
 *
 * Verifica: inicialización con llamadas al servicio, actualización de
 * signals tras respuesta, manejo de errores, paginación con filtros
 * activos, navegación a álbum y regreso.
 */
describe('Gallery', () => {
  let router: Router;
  let galleryService: GalleryService;

  const mockAlbumPage: AlbumPage = {
    albums: [
      {
        id: 'album-1', title: 'Taller PEAC', description: 'Desc', date: '2025-03-15',
        coverPhoto: '/thumb.jpg', photos: [], program: 'PEAC', subjects: ['Educación'],
        eventType: 'Taller', author: 'Juan', publisher: 'DIGEEX',
        populationType: 'Jóvenes', imageContext: 'Grupal', photoCount: 5,
      },
      {
        id: 'album-2', title: 'Conferencia PRONEA', description: '', date: '2025-04-01',
        coverPhoto: '', photos: [], program: 'PRONEA', subjects: [],
        eventType: 'Conferencia', author: '', publisher: '',
        populationType: '', imageContext: '', photoCount: 0,
      },
    ],
    totalElements: 8,
    totalPages: 2,
    page: 0,
    size: 6,
  };

  const mockFilterOptions: FilterOptions = {
    programs: [{ label: 'PEAC', value: 'PEAC', count: 3 }],
    eventTypes: [{ label: 'Taller', value: 'Taller', count: 2 }],
    populationTypes: [],
    imageContexts: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gallery, HttpClientTestingModule],
    }).compileComponents();

    router = TestBed.inject(Router);
    galleryService = TestBed.inject(GalleryService);
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
  });

  // ─── Inicialización ────────────────────────────────────

  it('debe crearse correctamente', () => {
    const fixture = TestBed.createComponent(Gallery);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('ngOnInit debe llamar searchAlbums y getFilterOptions del servicio', () => {
    const searchSpy = vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    const filterSpy = vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();

    expect(searchSpy).toHaveBeenCalledWith({}, 0, 6);
    expect(filterSpy).toHaveBeenCalled();
  });

  // ─── Carga de álbumes ──────────────────────────────────

  it('debe actualizar signals de albums, totalRecords y currentPage tras respuesta exitosa', () => {
    vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.albums().length).toBe(2);
    expect(component.albums()[0].title).toBe('Taller PEAC');
    expect(component.totalRecords()).toBe(8);
    expect(component.currentPage()).toBe(0);
    expect(component.isLoading()).toBe(false);
  });

  it('debe setear albums vacío y totalRecords 0 si el servicio da error', () => {
    vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(throwError(() => new Error('Server error')));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.albums()).toEqual([]);
    expect(component.totalRecords()).toBe(0);
    expect(component.isLoading()).toBe(false);
  });

  // ─── Opciones de filtro ────────────────────────────────

  it('debe poblar los signals de opciones de filtro desde el servicio', () => {
    vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.programOptions().length).toBe(1);
    expect(component.programOptions()[0].value).toBe('PEAC');
    expect(component.eventTypeOptions().length).toBe(1);
    expect(component.eventTypeOptions()[0].count).toBe(2);
  });

  // ─── Paginación ────────────────────────────────────────

  it('onPageChange debe llamar searchAlbums con la página correcta y filtros actuales', () => {
    const searchSpy = vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.currentFilters = { eventTypes: ['Taller'] };
    searchSpy.mockClear();

    component.onPageChange({ page: 2, rows: 6, first: 12 });

    expect(searchSpy).toHaveBeenCalledWith({ eventTypes: ['Taller'] }, 2, 6);
  });

  // ─── Filtros ───────────────────────────────────────────

  it('onFiltersChange debe llamar searchAlbums con filtros nuevos y resetear a página 0', () => {
    const searchSpy = vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    searchSpy.mockClear();

    const filters = { programs: ['PRONEA'], populationTypes: ['Adultos'] };
    fixture.componentInstance.onFiltersChange(filters);

    expect(searchSpy).toHaveBeenCalledWith(filters, 0, 6);
  });

  it('onClearFilters debe llamar searchAlbums sin filtros en página 0', () => {
    const searchSpy = vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    searchSpy.mockClear();

    fixture.componentInstance.onClearFilters();

    expect(searchSpy).toHaveBeenCalledWith({}, 0, 6);
  });

  // ─── Navegación ────────────────────────────────────────

  it('openAlbum debe navegar a /galeria/:id', () => {
    vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();

    fixture.componentInstance.openAlbum(mockAlbumPage.albums[0]);

    expect(router.navigate).toHaveBeenCalledWith(['/galeria', 'album-1']);
  });

  it('goBack debe navegar a /', () => {
    vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(mockAlbumPage));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(mockFilterOptions));

    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();

    fixture.componentInstance.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
