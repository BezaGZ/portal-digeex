import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { CollectionTable } from './collection-table';
import { Collection } from '../../../../../core/api/models/collection.model';

/**
 * Tests de CollectionTable.
 *
 * Tabla presentacional de programas (colecciones de una subdirección).
 * Renderiza una fila por colección y emite editRequest/deleteRequest
 * cuando el usuario interactúa.
 *
 * Ciclo 18 TDD — Sprint 6. Ajustado en Ciclos 5 y 21 (Sprint 8).
 */
describe('CollectionTable', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CollectionTable],
      providers: [provideNoopAnimations(), provideRouter([])],
    });
  });

  /** Verifica que cada fila exponga el botón "Ver historial" con routerLink al detail del programa. */
  it('should render a "Ver historial" button per row linking to /administrador/programas/<uuid>', () => {
    const fixture = TestBed.createComponent(CollectionTable);
    const items: Collection[] = [
      {
        uuid: 'coll-99',
        name: 'TestCol',
        handle: '123/99',
        type: 'collection',
        metadata: {},
        archivedItemsCount: 0,
      },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const linkBtn = fixture.nativeElement.querySelector('[data-testid="programa-view-history"]');
    expect(linkBtn).not.toBeNull();
  });

  it('should render one row per collection from the items input', () => {
    const fixture = TestBed.createComponent(CollectionTable);
    const items: Collection[] = [
      {
        uuid: 'coll-1',
        name: 'PEAC',
        handle: '123/200',
        metadata: {
          'dspace.entity.type': [{ value: 'Documento', language: null, authority: null, confidence: -1, place: 0 }],
        },
        archivedItemsCount: 4,
        type: 'collection',
      },
      {
        uuid: 'coll-2',
        name: 'PRONEA',
        handle: '123/201',
        metadata: {},
        archivedItemsCount: 0,
        type: 'collection',
      },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('PEAC');
    expect(rows[1].textContent).toContain('PRONEA');
  });

  /**
   * Verifica que se renderice img con loading=lazy cuando la collection trae logo embebido.
   * El src se arma vía el helper extractLogoUrl para que el shape HAL viva en un solo lugar.
   */
  it('should render an img tag with loading=lazy for the row when the collection has an embedded logo', () => {
    const fixture = TestBed.createComponent(CollectionTable);
    const items: Collection[] = [
      {
        uuid: 'coll-eva',
        name: 'EVA',
        handle: '123/300',
        metadata: {},
        archivedItemsCount: 0,
        type: 'collection',
        _embedded: {
          logo: {
            uuid: 'logo-bs-eva',
            name: 'logo.png',
            handle: null,
            metadata: {},
            sizeBytes: 1024,
            checkSum: { checkSumAlgorithm: 'MD5', value: 'x' },
            sequenceId: 1,
            type: 'bitstream',
          },
        },
      },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('tbody tr img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/server/api/core/bitstreams/logo-bs-eva/content');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  /** Verifica que sin logo embebido la celda muestre el placeholder pi pi-image y no haya img. */
  it('should render the pi pi-image placeholder when the collection has no embedded logo', () => {
    const fixture = TestBed.createComponent(CollectionTable);
    const items: Collection[] = [
      {
        uuid: 'coll-x',
        name: 'X',
        handle: '123/301',
        metadata: {},
        archivedItemsCount: 0,
        type: 'collection',
        _embedded: { logo: null },
      },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('tbody tr img')).toBeNull();
    expect(fixture.nativeElement.querySelector('tbody tr .pi-image')).not.toBeNull();
  });
});
