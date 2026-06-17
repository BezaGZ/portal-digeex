import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { PhotoGridItemComponent } from './photo-grid-item';

/**
 * Tests de `PhotoGridItemComponent`.
 *
 * Tile de la grilla del visor de álbum. La imagen se descarga de forma
 * diferida para que un álbum con muchas fotos no baje todas de golpe.
 *
 * Ciclo 6 TDD — Sprint 9.
 */
describe('PhotoGridItemComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhotoGridItemComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  /** Verifica que la imagen del tile se cargue de forma diferida (loading=lazy). */
  it('should render the photo image with lazy loading', () => {
    const fixture = TestBed.createComponent(PhotoGridItemComponent);
    fixture.componentRef.setInput('src', '/server/api/core/bitstreams/photo-1/content');
    fixture.detectChanges();

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('loading')).toBe('lazy');
  });
});
