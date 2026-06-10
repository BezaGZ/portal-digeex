import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { PublicLayout } from './public-layout';

/**
 * Tests de `PublicLayout`.
 *
 * Layout del portal público. Cubre el splash institucional de primera
 * carga: visible mientras `CollectionCacheService.menuReady` está en
 * false (los menús principal y secundario salen de ese cache) y ausente
 * cuando la carga resolvió.
 *
 * Ciclo 30 TDD — Sprint 8.
 */
describe('PublicLayout', () => {
  function setup(ready: boolean) {
    const menuReady = signal(ready);
    TestBed.configureTestingModule({
      imports: [PublicLayout],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: CollectionCacheService,
          useValue: {
            menuReady,
            getAll: vi.fn().mockReturnValue(of([])),
            getByMenuType: vi.fn().mockReturnValue(of([])),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PublicLayout);
    fixture.detectChanges();
    return { fixture, menuReady };
  }

  /** Verifica que el splash cubra la pantalla mientras los menús no cargaron. */
  it('should show the loading splash while menuReady is false', () => {
    const { fixture } = setup(false);

    expect(fixture.nativeElement.querySelector('[data-testid="portal-splash"]')).not.toBeNull();
  });

  /** Verifica que el splash desaparezca cuando la carga de menús resolvió. */
  it('should hide the loading splash once menuReady is true', () => {
    const { fixture, menuReady } = setup(false);

    menuReady.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="portal-splash"]')).toBeNull();
  });
});
