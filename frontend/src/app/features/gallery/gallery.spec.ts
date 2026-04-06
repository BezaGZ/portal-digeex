import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { Gallery } from './gallery';
import { GalleryService } from './services/gallery.service';

/**
 * Tests para Gallery (componente principal de galería).
 *
 * Carga álbumes paginados desde GalleryService, puebla
 * opciones de filtro, maneja paginación y navegación.
 *
 * Ciclo 5 TDD — Sprint 4 (RED).
 */
describe('Gallery', () => {
  let router: Router;
  let galleryService: GalleryService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gallery],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    galleryService = TestBed.inject(GalleryService);
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Gallery);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should call searchAlbums and getFilterOptions on init', () => {
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();

    expect(fixture.componentInstance.albums().length).toBeGreaterThan(0);
    expect(fixture.componentInstance.totalRecords()).toBe(8);
  });

  it('should update signals after successful album load', () => {
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.albums()[0].title).toBe('Taller PEAC');
    expect(component.currentPage()).toBe(0);
    expect(component.isLoading()).toBe(false);
  });

  it('should set empty albums on service error', () => {
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.albums()).toEqual([]);
    expect(component.totalRecords()).toBe(0);
  });

  it('should populate filter option signals from service', () => {
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.programOptions().length).toBeGreaterThan(0);
    expect(component.programOptions()[0].value).toBe('PEAC');
  });

  it('should call searchAlbums with new page on onPageChange', () => {
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.onPageChange({ page: 2, rows: 6, first: 12 });

    expect(component.currentPage()).toBe(2);
  });

  it('should reset to page 0 on onFiltersChange', () => {
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.onFiltersChange({ programs: ['PRONEA'] });

    expect(component.currentPage()).toBe(0);
  });

  it('should clear filters on onClearFilters', () => {
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();

    fixture.componentInstance.onClearFilters();

    expect(fixture.componentInstance.currentPage()).toBe(0);
  });

  it('should navigate to /galeria/:id on openAlbum', () => {
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();

    fixture.componentInstance.openAlbum({ id: 'album-1' } as any);

    expect(router.navigate).toHaveBeenCalledWith(['/galeria', 'album-1']);
  });

  it('should navigate to / on goBack', () => {
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();

    fixture.componentInstance.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
