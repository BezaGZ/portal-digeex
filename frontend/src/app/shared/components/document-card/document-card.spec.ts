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
 * Ciclo 21 TDD - Sprint 6.
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

    // Primer item: simulamos error de carga (DSpace devolvió 204).
    fixture.nativeElement.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.componentInstance.imageError()).toBe(true);

    // El componente se reusa: cambia al ítem con portada real (otra URL). El
    // flag debe resetearse para que el <img> vuelva a intentar la nueva URL.
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

    // Antes del error, el <img> se renderiza con la URL del thumbnail nativo.
    const initialImg = fixture.nativeElement.querySelector('img');
    expect(initialImg).not.toBeNull();

    // Simulamos el evento error del <img> y forzamos change detection.
    initialImg.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    // Tras el error la imagen desaparece y el fallback con ícono PDF queda visible.
    const imgAfter = fixture.nativeElement.querySelector('img');
    expect(imgAfter).toBeNull();
    const icon = fixture.nativeElement.querySelector('i.pi-file-pdf');
    expect(icon).not.toBeNull();
  });
});
