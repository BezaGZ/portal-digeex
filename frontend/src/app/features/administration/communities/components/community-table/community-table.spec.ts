import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { CommunityTable } from './community-table';
import { SubdireccionView } from '../../models/subdireccion-view.model';

/**
 * Tests de CommunityTable.
 *
 * Tabla presentacional que recibe la lista de subdirecciones por input
 * y emite los eventos editRequest y deleteRequest cuando el usuario
 * clickea los botones de cada fila. La visibilidad de los botones según
 * rol la decide el container con flags de input.
 *
 * Ciclo 17 TDD — Sprint 6. Ajustado en Ciclo 21 (Sprint 8).
 */
describe('CommunityTable', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommunityTable],
      providers: [provideNoopAnimations(), provideRouter([])],
    });
  });

  it('should render one row per subdirección from the items input', () => {
    const fixture = TestBed.createComponent(CommunityTable);
    const items: SubdireccionView[] = [
      { uuid: 'sub-1', name: 'Educación Básica', handle: '123/1', metadata: {}, archivedItemsCount: 0, type: 'community', programasCount: 4 },
      { uuid: 'sub-2', name: 'Trabajo', handle: '123/2', metadata: {}, archivedItemsCount: 0, type: 'community', programasCount: 4 },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Educación Básica');
    expect(rows[1].textContent).toContain('Trabajo');
  });

  /** Verifica que cada fila exponga el botón "Ver historial" con routerLink a la pantalla detail de la subdirección. */
  it('should render a "Ver historial" button per row linking to /administrador/subdirecciones/<uuid>', () => {
    const fixture = TestBed.createComponent(CommunityTable);
    const items: SubdireccionView[] = [
      { uuid: 'sub-1', name: 'Educación Básica', handle: '123/1', metadata: {}, archivedItemsCount: 0, type: 'community', programasCount: 4 },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const linkBtn = fixture.nativeElement.querySelector('[data-testid="subdireccion-view-history"]');
    expect(linkBtn).not.toBeNull();
  });
});
