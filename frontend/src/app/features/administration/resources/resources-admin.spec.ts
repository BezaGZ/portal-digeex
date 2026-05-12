import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { vi } from 'vitest';
import { EMPTY, of } from 'rxjs';

import { ResourcesAdmin } from './resources-admin';
import { ResourcesAdminFacade } from '../content/services/resources-admin-facade';
import { ItemAdminFacade } from '../content/services/item-admin-facade';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { MyDSpaceObject } from '../../../core/api/models/my-dspace.model';

/**
 * Tests de `ResourcesAdmin`.
 *
 * Pantalla `/administrador/recursos` con tabs Activos / Eliminados,
 * tabla server-side y acciones contextuales por tab. Reusa los helpers
 * compartidos de `my-dspace-object.util` y delega scope + filtros al
 * `ResourcesAdminFacade`.
 *
 * Ciclo 33 TDD — Sprint 6.
 */
describe('ResourcesAdmin', () => {
  let searchFn: ReturnType<typeof vi.fn>;
  let withdrawFn: ReturnType<typeof vi.fn>;
  let restoreFn: ReturnType<typeof vi.fn>;
  let confirmFn: ReturnType<typeof vi.fn>;

  function buildObject(uuid: string, withdrawn = false): MyDSpaceObject {
    return {
      type: 'discover',
      indexableObject: {
        uuid,
        name: `Item ${uuid}`,
        handle: `123/${uuid}`,
        metadata: {
          'dc.title': [{ value: `Item ${uuid}`, language: null, authority: null, confidence: -1, place: 0 }],
        },
        inArchive: !withdrawn,
        discoverable: true,
        withdrawn,
        lastModified: '2026-05-12T00:00:00Z',
        type: 'item',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    };
  }

  beforeEach(() => {
    searchFn = vi.fn().mockReturnValue(
      of({
        items: [buildObject('a'), buildObject('b')],
        totalElements: 2,
        totalPages: 1,
        page: 0,
        size: 20,
      }),
    );
    withdrawFn = vi.fn().mockReturnValue(of({}));
    restoreFn = vi.fn().mockReturnValue(of({}));
    confirmFn = vi.fn().mockImplementation((opts: { accept?: () => void }) => opts.accept?.());

    TestBed.configureTestingModule({
      imports: [ResourcesAdmin],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ResourcesAdminFacade, useValue: { search$: searchFn } },
        { provide: ItemAdminFacade, useValue: { withdrawItem$: withdrawFn, restoreItem$: restoreFn } },
        {
          provide: AuthCallerService,
          useValue: { currentCaller$: of({ role: 'superadmin', sufijo: null }) },
        },
        {
          provide: ConfirmationService,
          useValue: { confirm: confirmFn, requireConfirmation$: EMPTY, accept: EMPTY },
        },
      ],
    });
  });

  /** Verifica que en init se llame search$ con withdrawn=false (tab Activos). */
  it('should call search$ with withdrawn=false on init', () => {
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalled();
    const opts = searchFn.mock.calls[0][0];
    expect(opts.withdrawn).toBe(false);
  });

  /** Verifica que al cambiar a la tab Eliminados se recargue con withdrawn=true. */
  it('should switch to withdrawn=true when the user clicks Eliminados tab', () => {
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();
    searchFn.mockClear();

    fixture.componentInstance.onTabChange('eliminados');

    expect(searchFn).toHaveBeenCalled();
    expect(searchFn.mock.calls[0][0].withdrawn).toBe(true);
  });

  /** Verifica que en la tab Activos se muestren Editar y Eliminar y no Restaurar. */
  it('should render Editar and Eliminar actions in the Activos tab', () => {
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="action-edit"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="action-delete"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="action-restore"]')).toBeNull();
  });

  /** Verifica que en la tab Eliminados se muestre Restaurar y no Editar/Eliminar. */
  it('should render Restaurar action in the Eliminados tab only', () => {
    searchFn.mockReturnValue(
      of({
        items: [buildObject('w', true)],
        totalElements: 1,
        totalPages: 1,
        page: 0,
        size: 20,
      }),
    );
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();
    fixture.componentInstance.onTabChange('eliminados');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="action-restore"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="action-edit"]')).toBeNull();
    expect(root.querySelector('[data-testid="action-delete"]')).toBeNull();
  });

  /** Verifica que onDelete pase por confirmación y dispatche withdrawItem$. */
  it('should confirm and dispatch withdrawItem$ on onDelete', () => {
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();

    fixture.componentInstance.onDelete('uuid-x');

    expect(confirmFn).toHaveBeenCalled();
    expect(withdrawFn).toHaveBeenCalledWith('uuid-x', '');
  });

  /** Verifica que onRestore pase por confirmación y dispatche restoreItem$. */
  it('should confirm and dispatch restoreItem$ on onRestore', () => {
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();

    fixture.componentInstance.onRestore('uuid-y');

    expect(confirmFn).toHaveBeenCalled();
    expect(restoreFn).toHaveBeenCalledWith('uuid-y', '');
  });

  /** Verifica que el filtro entityType viaje al facade cuando el usuario lo elige. */
  it('should pass entityType filter to search$ when set', () => {
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();
    searchFn.mockClear();

    fixture.componentInstance.entityType.set('Documento');
    fixture.componentInstance.onFiltersChange();

    expect(searchFn).toHaveBeenCalled();
    expect(searchFn.mock.calls[0][0].entityType).toBe('Documento');
  });

  /** Verifica que onEdit navegue a la ruta de edición del item. */
  it('should navigate to /administrador/envios/:uuid/editar on onEdit', () => {
    const fixture = TestBed.createComponent(ResourcesAdmin);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.onEdit('item-1');

    expect(navigate).toHaveBeenCalledWith(['/administrador/envios', 'item-1', 'editar']);
  });
});
