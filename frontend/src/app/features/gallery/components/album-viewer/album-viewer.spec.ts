import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { AlbumViewer } from './album-viewer';

describe('AlbumViewer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlbumViewer, HttpClientTestingModule],
      providers: [{ provide: ActivatedRoute, useValue: { params: of({ id: 'test-album' }) } }],
    }).compileComponents();
  });

  it('debe crearse correctamente', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('debe iniciar con isLoading en true y album en null', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    const component = fixture.componentInstance;
    expect(component.isLoading()).toBe(true);
    expect(component.album()).toBeNull();
  });

  it('debe iniciar con galleria cerrada', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    const component = fixture.componentInstance;
    expect(component.displayGalleria()).toBe(false);
    expect(component.activeIndex()).toBe(0);
  });

  it('openGalleria debe abrir galleria con el índice correcto', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    const component = fixture.componentInstance;
    component.openGalleria(3);
    expect(component.activeIndex()).toBe(3);
    expect(component.displayGalleria()).toBe(true);
  });

  it('formatDate debe formatear fechas correctamente', () => {
    const fixture = TestBed.createComponent(AlbumViewer);
    const component = fixture.componentInstance;
    const formatted = component.formatDate('2025-03-15');
    expect(formatted).toContain('2025');
  });
});
