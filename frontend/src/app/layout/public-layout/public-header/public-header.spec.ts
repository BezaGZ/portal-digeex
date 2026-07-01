import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { NAV_LOCATION } from '../../../core/config/digeex-values.config';
import { PublicHeader } from './public-header';

/**
 * Tests de `PublicHeader`.
 *
 * Header del portal público. Cubre el armado del menú secundario desde el
 * cache de colecciones (el label usa el nombre completo, no la sigla) y el
 * feedback de error: la apertura/cierre del panel la maneja `p-popover` de
 * PrimeNG, así que no se prueba acá.
 *
 * Ciclo 32 TDD — Sprint 8. Ajustado en Ciclos 40, 44.
 */
describe('PublicHeader', () => {
  function setup(collections: unknown[], cacheOverride: Record<string, unknown> = {}) {
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
            invalidate: vi.fn(),
            ...cacheOverride,
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

    const labels = fixture.componentInstance.menuItems()
      .filter((m) => !m.separator)
      .map((m) => m.label);
    expect(labels).toEqual(['Datos Estadísticos Institucionales']);
  });

  /** Verifica que menuError se prenda cuando la carga del menú secundario falla. */
  it('should set menuError when the secondary menu fails to load', () => {
    const fixture = setup([], {
      getByMenuType: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
    });

    expect(fixture.componentInstance.menuError()).toBe(true);
  });

  /**
   * Verifica que retryMenu invalide el cache y recargue, limpiando el error.
   * invalidate() es necesario porque el cache deja el error cacheado con shareReplay.
   */
  it('should invalidate the cache and reload, clearing the error, on retry', () => {
    const cols = [
      {
        uuid: 'col-1',
        name: 'Documentos',
        metadata: {
          'dspace.entity.type': [{ value: 'Documento' }],
          'digeex.navLocation': [{ value: NAV_LOCATION.MENU_SECUNDARIO }],
        },
      },
    ];
    const getByMenuType = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('boom')))
      .mockReturnValue(of(cols));
    const fixture = setup([], { getByMenuType });
    const cache = TestBed.inject(CollectionCacheService);
    expect(fixture.componentInstance.menuError()).toBe(true);

    fixture.componentInstance.retryMenu();

    expect(cache.invalidate).toHaveBeenCalled();
    expect(fixture.componentInstance.menuError()).toBe(false);
    expect(
      fixture.componentInstance.menuItems().filter((m) => !m.separator).length,
    ).toBe(1);
  });

  /** Verifica que el header arranque sin elevación (sin sombra). */
  it('should start not scrolled', () => {
    expect(setup([]).componentInstance.scrolled()).toBe(false);
  });

  /** Verifica que arriba del todo el header quede sin elevación. */
  it('should not be scrolled at the top of the page', () => {
    const c = setup([]).componentInstance;

    c.onScroll(0);

    expect(c.scrolled()).toBe(false);
  });

  /** Verifica que al scrolear pasado el umbral el header gane elevación. */
  it('should be scrolled once past the elevation threshold', () => {
    const c = setup([]).componentInstance;

    c.onScroll(40);

    expect(c.scrolled()).toBe(true);
  });
});
