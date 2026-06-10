import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { NAV_LOCATION } from '../../../core/config/digeex-values.config';
import { PublicHeader } from './public-header';

/**
 * Tests de `PublicHeader`.
 *
 * Header del portal público. Cubre el armado del menú secundario desde el
 * cache de colecciones: el label usa el nombre completo de la colección y
 * no la sigla de `dc.title.alternative`, que queda reservada para
 * program-view y el breadcrumb del documento.
 *
 * Ciclo 32 TDD — Sprint 8.
 */
describe('PublicHeader', () => {
  function setup(collections: unknown[]) {
    TestBed.configureTestingModule({
      imports: [PublicHeader],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: CollectionCacheService,
          useValue: {
            getByMenuType: vi.fn().mockReturnValue(of(collections)),
            getAll: vi.fn().mockReturnValue(of(collections)),
            menuReady: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PublicHeader);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Verifica que el menú secundario use el nombre completo de la colección
   * aunque exista dc.title.alternative (la sigla corta es para otras vistas).
   */
  it('should label menu items with the full collection name, not the short alternative title', () => {
    const fixture = setup([
      {
        uuid: 'col-1',
        name: 'Datos Estadísticos Institucionales',
        metadata: {
          'dc.title.alternative': [{ value: 'DATOS' }],
          'dspace.entity.type': [{ value: 'Estadistica' }],
          'digeex.navLocation': [{ value: NAV_LOCATION.MENU_SECUNDARIO }],
        },
      },
    ]);

    const labels = fixture.componentInstance.menuItems
      .filter((m) => !m.separator)
      .map((m) => m.label);
    expect(labels).toEqual(['Datos Estadísticos Institucionales']);
  });
});
