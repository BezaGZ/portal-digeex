import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { MenuItem } from 'primeng/api';

import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { BreadcrumbComponent } from './app.breadcrumb';

/**
 * Tests de `BreadcrumbComponent` (layout admin).
 *
 * El trail publicado en `BreadcrumbService` por la página activa (nombre
 * real del recurso) tiene prioridad y se muestra con la raíz Administrador
 * antepuesta; sin publicación cae al trail derivado de `data.breadcrumb`.
 * Mismo contrato que PublicBreadcrumb. La navegación limpia el trail para
 * que no sobreviva al cambiar de página.
 *
 * Ciclo 34 TDD — Sprint 8.
 */
describe('BreadcrumbComponent', () => {
  function setup() {
    const trail = signal<MenuItem[]>([]);
    const clearFn = vi.fn(() => trail.set([]));
    TestBed.configureTestingModule({
      imports: [BreadcrumbComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: BreadcrumbService,
          useValue: { trail: trail.asReadonly(), clear: clearFn, setTrail: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    fixture.detectChanges();
    return { fixture, trail, clearFn };
  }

  /** Verifica que el trail del servicio se muestre con la raíz Administrador antepuesta. */
  it('should display the service trail prefixed with the Administrador root when one is published', () => {
    const { fixture, trail } = setup();

    trail.set([
      { label: 'Programas', routerLink: ['/administrador/programas'] },
      { label: 'Alfabetización Bilingüe' },
    ]);
    fixture.detectChanges();

    const items = fixture.componentInstance.displayItems();
    expect(items.map((i) => i.label)).toEqual([
      'Administrador',
      'Programas',
      'Alfabetización Bilingüe',
    ]);
    expect(items[0].routerLink).toBe('/administrador');
  });

  /** Verifica el fallback al trail derivado de rutas cuando el servicio no publicó nada. */
  it('should fall back to the route-derived trail when the service trail is empty', () => {
    const { fixture } = setup();

    expect(fixture.componentInstance.displayItems()).toEqual([]);
  });

  /**
   * Verifica que la navegación limpie el trail del servicio.
   * La página entrante lo republica al resolver datos; uno viejo no debe sobrevivir.
   */
  it('should clear the service trail on navigation', async () => {
    const { fixture, trail, clearFn } = setup();
    trail.set([{ label: 'Programas' }]);

    await TestBed.inject(Router).navigateByUrl('/administrador/usuarios');
    fixture.detectChanges();

    expect(clearFn).toHaveBeenCalled();
  });
});
