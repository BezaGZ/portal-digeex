import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { DocumentCardComponent } from './document-card';
import { ItemView } from '../../../core/api/models';

/**
 * Tests del card del listado público.
 *
 * Centra los casos UX que el componente promete: se muestra siempre el
 * ícono PDF cuando el thumbnail no se puede renderizar (DSpace devolvió
 * 204/404 al endpoint nativo /thumbnail), y el botón Descargar emite el
 * ItemView para que el padre maneje el lazy lookup de bitstreams.
 *
 * Ciclo 36 TDD — Sprint 6.
 */
describe('DocumentCardComponent', () => {
  function buildItem(): ItemView {
    return {
      id: 'item-1',
      name: 'Documento de prueba',
      description: '',
      dateIssued: '2026-05-09',
      handle: '123/1',
      coverImage: '/server/api/core/items/item-1/thumbnail',
      bitstreams: [],
      type: 'Manual',
      relationUri: '',
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentCardComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  /** Verifica que el flag imageError se resetee cuando cambia la entrada item.coverImage. */
  it('should reset imageError flag when the input item.coverImage changes', () => {
    const fixture = TestBed.createComponent(DocumentCardComponent);
    fixture.componentRef.setInput('item', buildItem());
    fixture.detectChanges();

    fixture.nativeElement.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.componentInstance.imageError()).toBe(true);

    fixture.componentRef.setInput('item', {
      ...buildItem(),
      id: 'item-with-cover',
      coverImage: '/server/api/core/bitstreams/cover-uuid/content',
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.imageError()).toBe(false);
  });

  /** Verifica que ante fallo de carga del thumbnail se muestre el ícono PDF como fallback. */
  it('should fall back to the PDF icon when the thumbnail image fails to load', () => {
    const fixture = TestBed.createComponent(DocumentCardComponent);
    fixture.componentRef.setInput('item', buildItem());
    fixture.detectChanges();

    const initialImg = fixture.nativeElement.querySelector('img');
    expect(initialImg).not.toBeNull();

    initialImg.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    const imgAfter = fixture.nativeElement.querySelector('img');
    expect(imgAfter).toBeNull();
    const icon = fixture.nativeElement.querySelector('i.pi-file-pdf');
    expect(icon).not.toBeNull();
  });

  /** Verifica que en modo Video se renderice el botón "Ver" en lugar de "Descargar". */
  it('should render the "Ver" button and not "Descargar" when item.type is Video', () => {
    const fixture = TestBed.createComponent(DocumentCardComponent);
    fixture.componentRef.setInput('item', {
      ...buildItem(),
      type: 'Video',
      relationUri: 'https://youtu.be/abc',
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent ?? '') as string;
    expect(text).toContain('Ver');
    expect(text).not.toContain('Descargar');
  });

  /** Verifica que el fallback de un item Video sin portada sea el ícono play-circle. */
  it('should show pi-play-circle as fallback when item is Video and the cover image fails', () => {
    const fixture = TestBed.createComponent(DocumentCardComponent);
    fixture.componentRef.setInput('item', { ...buildItem(), type: 'Video' });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('i.pi-play-circle');
    expect(icon).not.toBeNull();
    const pdfIcon = fixture.nativeElement.querySelector('i.pi-file-pdf');
    expect(pdfIcon).toBeNull();
  });

  /** Verifica que dateIssued se renderice preservando el día local del ISO. */
  it('should render dateIssued preserving the local day for a full ISO date', () => {
    const fixture = TestBed.createComponent(DocumentCardComponent);
    fixture.componentRef.setInput('item', { ...buildItem(), dateIssued: '2026-05-04' });
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent ?? '') as string;
    expect(text).toContain('4');
    expect(text).toContain('5');
    expect(text).toContain('26');
    expect(text).not.toMatch(/\b3\/5\/26\b/);
  });
});
