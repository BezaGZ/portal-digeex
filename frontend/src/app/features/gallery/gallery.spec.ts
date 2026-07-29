import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Gallery } from './gallery';
import { GalleryService } from './services/gallery.service';
import { StatisticsTrackingService } from '../../core/api/statistics-tracking.service';
import { CollectionCacheService } from '../../core/api/collection-cache.service';
import { Collection } from '../../core/api/models/collection.model';
import { AlbumPage, FilterOptions } from './models';

/**
 * Tests para Gallery (componente principal de galería).
 *
 * Carga álbumes paginados desde GalleryService, puebla
 * opciones de filtro, maneja paginación y navegación.
 *
 * Ciclo 5 TDD — Sprint 4. Ajustado en Ciclo 26 (Sprint 8), Ciclo 62 (Sprint 10)
 * y el 29/07/2026 (header con metadata de la colección, fuera de sprint).
 */
describe('Gallery', () => {
  let router: Router;
  let galleryService: GalleryService;
  let tracking: StatisticsTrackingService;
  let collectionCache: CollectionCacheService;

  /** Fixtures */

  const MOCK_ALBUM_PAGE: AlbumPage = {
    albums: [
      {
        id: 'album-1', title: 'Taller PEAC', description: 'Desc', date: '2025-03-15',
        coverPhoto: '/thumb.jpg', photos: [], program: 'PEAC', subjects: ['Educación'],
        eventType: 'Taller', author: 'DIGEEX', publisher: 'MINEDUC',
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

  const MOCK_FILTER_OPTIONS: FilterOptions = {
    programs: [{ label: 'PEAC', value: 'PEAC', count: 3 }],
    eventTypes: [{ label: 'Taller', value: 'Taller', count: 2 }],
    populationTypes: [],
    imageContexts: [],
  };

  const MOCK_COLLECTION = {
    uuid: 'col-galeria',
    name: 'Galería Institucional',
    metadata: {
      'dc.title': [{ value: 'Galería fotográfica de DIGEEX' }],
      'dc.description': [{ value: 'Registro visual de las actividades extraescolares' }],
    },
  } as unknown as Collection;

  /** Setup */

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gallery],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    galleryService = TestBed.inject(GalleryService);
    tracking = TestBed.inject(StatisticsTrackingService);
    collectionCache = TestBed.inject(CollectionCacheService);

    vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(of(MOCK_ALBUM_PAGE));
    vi.spyOn(galleryService, 'getFilterOptions').mockReturnValue(of(MOCK_FILTER_OPTIONS));
    vi.spyOn(galleryService, 'getGalleryCollectionUuid$').mockReturnValue(of('col-galeria'));
    vi.spyOn(collectionCache, 'findCollectionByUuid').mockReturnValue(of(MOCK_COLLECTION));
    vi.spyOn(tracking, 'trackView$').mockReturnValue(of(undefined));
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should create', () => {
    const fixture = TestBed.createComponent(Gallery);
    expect(fixture.componentInstance).toBeTruthy();
  });

  /** Carga de álbumes */

  describe('album loading', () => {
    /** Verifica que se llame a searchAlbums y getFilterOptions al inicializar. */
    it('should call searchAlbums and getFilterOptions on init', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      expect(galleryService.searchAlbums).toHaveBeenCalledWith({}, 0, 6, 'col-galeria');
      expect(galleryService.getFilterOptions).toHaveBeenCalled();
      expect(fixture.componentInstance.albums().length).toBe(2);
      expect(fixture.componentInstance.totalRecords()).toBe(8);
    });

    /** Verifica que los signals se actualicen tras carga exitosa de álbumes. */
    it('should update signals after successful album load', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(component.albums()[0].title).toBe('Taller PEAC');
      expect(component.currentPage()).toBe(0);
      expect(component.isLoading()).toBe(false);
    });

    /** Verifica que se establezcan álbumes vacíos en caso de error del servicio. */
    it('should set empty albums on service error', () => {
      vi.spyOn(galleryService, 'searchAlbums').mockReturnValue(throwError(() => new Error('Server error')));

      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      expect(fixture.componentInstance.albums()).toEqual([]);
      expect(fixture.componentInstance.totalRecords()).toBe(0);
    });

    /** Verifica que los signals de opciones de filtro se pueblen desde el servicio. */
    it('should populate filter option signals from service', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(component.programOptions().length).toBe(1);
      expect(component.programOptions()[0].value).toBe('PEAC');
      expect(component.eventTypeOptions().length).toBe(1);
    });
  });

  /** Paginación y filtros */

  describe('pagination and filters', () => {
    /** Verifica que onPageChange() llame a searchAlbums con la nueva página. */
    it('should call searchAlbums with new page on onPageChange', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      const searchSpy = galleryService.searchAlbums as ReturnType<typeof vi.fn>;
      searchSpy.mockClear();

      fixture.componentInstance.onPageChange({ page: 2, rows: 6, first: 12 });

      expect(searchSpy).toHaveBeenCalledWith({}, 2, 6, 'col-galeria');
    });

    /** Verifica que onFiltersChange() reinicie a página 0 con los nuevos filtros. */
    it('should reset to page 0 on onFiltersChange', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      const searchSpy = galleryService.searchAlbums as ReturnType<typeof vi.fn>;
      searchSpy.mockClear();

      fixture.componentInstance.onFiltersChange({ programs: ['PRONEA'] });

      expect(searchSpy).toHaveBeenCalledWith({ programs: ['PRONEA'] }, 0, 6, 'col-galeria');
    });

    /** Verifica que onClearFilters() limpie filtros y reinicie la búsqueda. */
    it('should clear filters on onClearFilters', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      const searchSpy = galleryService.searchAlbums as ReturnType<typeof vi.fn>;
      searchSpy.mockClear();

      fixture.componentInstance.onClearFilters();

      expect(searchSpy).toHaveBeenCalledWith({}, 0, 6, 'col-galeria');
    });
  });

  /** Tracking de visita a la colección */

  describe('collection view tracking', () => {
    /** Verifica que se registre una visita a la colección al inicializar el componente. */
    it('should register one view to the Galeria collection on init', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      expect(galleryService.getGalleryCollectionUuid$).toHaveBeenCalledTimes(1);
      expect(tracking.trackView$).toHaveBeenCalledWith('col-galeria', 'collection');
      expect(tracking.trackView$).toHaveBeenCalledTimes(1);
    });

    /** Verifica que cambiar de página no dispare un tracking adicional. */
    it('should not track an extra view on page change', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      fixture.componentInstance.onPageChange({ page: 2, rows: 6, first: 12 });
      fixture.componentInstance.onPageChange({ page: 3, rows: 6, first: 18 });

      expect(tracking.trackView$).toHaveBeenCalledTimes(1);
    });

    /** Verifica que cambiar filtros no dispare un tracking adicional. */
    it('should not track an extra view on filter change or clear', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      fixture.componentInstance.onFiltersChange({ programs: ['PRONEA'] });
      fixture.componentInstance.onClearFilters();

      expect(tracking.trackView$).toHaveBeenCalledTimes(1);
    });
  });

  /** Header con metadata de la colección */

  describe('collection header', () => {
    /** Verifica que el header renderice dc.title y dc.description de la colección cacheada. */
    it('should render dc.title and dc.description from the cached collection in the header', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      expect(collectionCache.findCollectionByUuid).toHaveBeenCalledWith('col-galeria');
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('h1')?.textContent).toContain('Galería fotográfica de DIGEEX');
      expect(host.querySelector('.page-subtitle')?.textContent).toContain(
        'Registro visual de las actividades extraescolares',
      );
    });

    /** Verifica el fallback a los textos estáticos cuando el lookup de la colección falla. */
    it('should fall back to the static header texts when the collection lookup fails', () => {
      (collectionCache.findCollectionByUuid as ReturnType<typeof vi.fn>).mockReturnValue(
        throwError(() => new Error('uuid no cacheado')),
      );

      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('h1')?.textContent).toContain('Galería Institucional');
      expect(host.querySelector('.page-subtitle')?.textContent).toContain(
        'Momentos destacados de las actividades',
      );
    });
  });

  /** Navegación */

  describe('navigation', () => {
    /** Verifica que openAlbum() navegue a /galeria/:collectionUuid/album/:albumId. */
    it('should navigate to /galeria/:collectionUuid/album/:albumId on openAlbum', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.componentInstance.openAlbum({ id: 'album-1' } as any);

      expect(router.navigate).toHaveBeenCalledWith(['/galeria', 'col-galeria', 'recurso', 'album-1']);
    });

    /** Verifica que goBack() navegue a la raíz. */
    it('should navigate to / on goBack', () => {
      const fixture = TestBed.createComponent(Gallery);
      fixture.detectChanges();

      fixture.componentInstance.goBack();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
