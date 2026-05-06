import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { CollectionTable } from './collection-table';
import { Collection } from '../../../../../core/api/models/collection.model';

/**
 * Tests de CollectionTable.
 *
 * Tabla presentacional de programas (colecciones de una subdirección).
 * Renderiza una fila por colección y emite editRequest/deleteRequest
 * cuando el usuario interactúa.
 *
 * Ciclo 18 TDD — Sprint 6
 */
describe('CollectionTable', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CollectionTable],
      providers: [provideNoopAnimations()],
    });
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
});
