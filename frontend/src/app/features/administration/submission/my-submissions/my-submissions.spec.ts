import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EMPTY, NEVER, Subject, of } from 'rxjs';

import { MySubmissions } from './my-submissions';
import { MyDSpaceApiService } from '../../../../core/api/my-dspace-api.service';
import { ItemAdminFacade } from '../../content/services/item-admin-facade';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { ConfirmationService } from 'primeng/api';
import { LoadingService } from '../../../../core/loading/loading.service';

/**
 * Tests del componente MySubmissions.
 *
 * Bandeja personal del usuario logueado. Consume el endpoint MyDSpace de
 * DSpace 9 (`configuration=workspace`) que combina items archivados,
 * workspaceitems (drafts) y workflowitems del eperson. Por ahora el flow
 * solo expone items archivados; el badge de estado se deriva de los flags
 * nativos `withdrawn` y `discoverable`. La acción Eliminar dispara el
 * facade pre-existente `ItemAdminFacade.withdrawItem$` con el sufijo del
 * caller logueado y recarga la página actual.
 *
 * Ajustado en Ciclos 56 y 62 (Sprint 10).
 */
describe('MySubmissions', () => {
  let searchFn: ReturnType<typeof vi.fn>;
  let withdrawFn: ReturnType<typeof vi.fn>;
  let restoreFn: ReturnType<typeof vi.fn>;
  let confirmFn: ReturnType<typeof vi.fn>;

  const buildItemObject = (uuid: string, title: string) => ({
    type: 'discover',
    indexableObject: {
      uuid,
      name: title,
      handle: `123456789/${uuid}`,
      metadata: {
        'dc.title': [{ value: title, language: null, authority: null, confidence: -1, place: 0 }],
      },
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T05:00:53Z',
      type: 'item',
    },
  });

  /** Item archivado con entity-type y owningCollection, con ruta pública resoluble. */
  const buildRoutedObject = (uuid: string, inArchive = true) => {
    const o = buildItemObject(uuid, `Item ${uuid}`);
    return {
      ...o,
      indexableObject: {
        ...o.indexableObject,
        inArchive,
        metadata: {
          ...o.indexableObject.metadata,
          'dspace.entity.type': [
            { value: 'Documento', language: null, authority: null, confidence: -1, place: 0 },
          ],
        },
        owningCollection: { uuid: 'col-1', name: 'Programa', type: 'collection' },
      },
    };
  };

  beforeEach(() => {
    searchFn = vi.fn().mockReturnValue(
      of({
        items: [buildItemObject('a', 'Album A'), buildItemObject('b', 'Album B')],
        totalElements: 2,
        totalPages: 1,
        size: 20,
        page: 0,
      }),
    );

    withdrawFn = vi.fn().mockReturnValue(of({}));
    restoreFn = vi.fn().mockReturnValue(of({}));
    confirmFn = vi.fn().mockImplementation((opts: { accept?: () => void }) => opts.accept?.());

    TestBed.configureTestingModule({
      imports: [MySubmissions],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: MyDSpaceApiService, useValue: { search$: searchFn } },
        { provide: ItemAdminFacade, useValue: { withdrawItem$: withdrawFn, restoreItem$: restoreFn } },
        {
          provide: AuthCallerService,
          useValue: { currentCaller$: of({ role: 'superadmin', scopeUuid: 'PEAC' }) },
        },
        {
          provide: ConfirmationService,
          useValue: {
            confirm: confirmFn,
            requireConfirmation$: EMPTY,
            accept: EMPTY,
          },
        },
      ],
    });
  });

  /** Verifica que en init se pegue al servicio con page=0 y el fetch size del componente y que el template renderice una card por item del response. */
  it('should call MyDSpaceApiService.search$ on init with page=0 and render one card per item', () => {
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    expect(searchFn).toHaveBeenCalledWith(0, 20, expect.anything());
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="my-submission-card"]');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Album A');
    expect(cards[1].textContent).toContain('Album B');
  });

  /** Verifica que se muestre "Ver" cuando el envío archivado tiene ruta pública resoluble. */
  it('should render the Ver action for archived submissions with a public route', () => {
    searchFn.mockReturnValue(
      of({ items: [buildRoutedObject('a')], totalElements: 1, totalPages: 1, size: 20, page: 0 }),
    );
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="action-view"]')).not.toBeNull();
  });

  /** Verifica que la acción "Ver" se oculte para borradores no archivados, sin vista pública. */
  it('should NOT render the Ver action for non-archived drafts', () => {
    searchFn.mockReturnValue(
      of({
        items: [buildRoutedObject('d', false)],
        totalElements: 1,
        totalPages: 1,
        size: 20,
        page: 0,
      }),
    );
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="action-view"]')).toBeNull();
  });

  /** Verifica que onView abra la vista pública en pestaña nueva (conserva la bandeja intacta). */
  it('should open the public view in a new tab on onView', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    fixture.componentInstance.onView(buildRoutedObject('item-9'));

    expect(openSpy).toHaveBeenCalledWith('/programas/col-1/recurso/item-9', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  /** Verifica que retirar un envío enrole una tarea de carga global mientras está en vuelo. */
  it('should enrol a loading task while withdrawing a submission', () => {
    withdrawFn.mockReturnValue(NEVER);
    const loading = TestBed.inject(LoadingService);
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    expect(loading.active()).toBe(false);
    fixture.componentInstance.onDelete('a');
    expect(loading.active()).toBe(true);
  });

  /** Verifica que onPageChange propague el page solicitado al servicio para que el listado se actualice al cambiar de página. */
  it('should reload calling search$ with the requested page when the paginator emits onPageChange', () => {
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    searchFn.mockClear();
    fixture.componentInstance.onPageChange({ page: 1 });

    expect(searchFn).toHaveBeenCalledWith(1, 20, expect.anything());
  });

  /** Verifica que el badge se derive correctamente de los flags `withdrawn` y `discoverable`. */
  it('should render the state badge for each archived item: pública, privada or eliminada', () => {
    const publica = buildItemObject('p', 'Item Público');
    const privada = buildItemObject('q', 'Item Privado');
    privada.indexableObject.discoverable = false;
    const eliminada = buildItemObject('r', 'Item Eliminado');
    eliminada.indexableObject.withdrawn = true;

    searchFn.mockReturnValue(
      of({
        items: [publica, privada, eliminada],
        totalElements: 3,
        totalPages: 1,
        size: 20,
        page: 0,
      }),
    );

    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('[data-testid="my-submission-state-badge"]');
    expect(badges.length).toBe(3);
    expect(badges[0].textContent.trim()).toBe('Pública');
    expect(badges[1].textContent.trim()).toBe('Privada');
    expect(badges[2].textContent.trim()).toBe('Eliminada');
  });

  /** Verifica que el spinner se muestre mientras search$ está pendiente y se oculte al resolverse. */
  it('should show the loading spinner during the initial search$ call and hide it once the response resolves', () => {
    const pending = new Subject<{
      items: ReturnType<typeof buildItemObject>[];
      totalElements: number;
      totalPages: number;
      size: number;
      page: number;
    }>();
    searchFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="my-submission-card"]')).toBeFalsy();

    pending.next({
      items: [buildItemObject('a', 'Album A')],
      totalElements: 1,
      totalPages: 1,
      size: 20,
      page: 0,
    });
    pending.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).toBeFalsy();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="my-submission-card"]').length).toBe(1);
  });

  /** Verifica el flujo completo del soft delete: confirm, withdraw con sufijo del caller y refresh. */
  it('should withdraw the item with the current caller sufijo after the user confirms and then reload the current page', () => {
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();

    searchFn.mockClear();
    fixture.componentInstance.onDelete('uuid-a');

    expect(confirmFn).toHaveBeenCalled();
    expect(withdrawFn).toHaveBeenCalledWith('uuid-a', 'PEAC');
    expect(searchFn).toHaveBeenCalledWith(0, 20, expect.anything());
  });

  /** Verifica que el input de búsqueda dispare search$ con el query solo después del debounce (300ms). */
  it('should call search$ with the typed query after the debounce window', fakeAsync(() => {
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();
    searchFn.mockClear();

    fixture.componentInstance.onQueryInput('reporte anual');
    tick(299);
    expect(searchFn).not.toHaveBeenCalled();

    tick(1);
    expect(searchFn).toHaveBeenCalledWith(0, 20, expect.objectContaining({ query: 'reporte anual' }));
  }));

  /** Verifica que cambiar rango de fechas y orden dispare search$ con las opts fusionadas. */
  it('should call search$ with the merged opts when date range and sort change', () => {
    const fixture = TestBed.createComponent(MySubmissions);
    fixture.detectChanges();
    searchFn.mockClear();

    const c = fixture.componentInstance;
    c.dateFrom.set(2020);
    c.dateTo.set(2024);
    c.sortBy.set('dc.title,asc');
    c.onFiltersChange();

    expect(searchFn).toHaveBeenCalledWith(
      0,
      20,
      expect.objectContaining({ dateFrom: 2020, dateTo: 2024, sort: 'dc.title,asc' }),
    );
  });

  /** Verifica que las funciones de columna toleren indexableObject.metadata undefined. */
  it('should not throw when indexableObject.metadata is undefined', async () => {
    const fixture = TestBed.createComponent(MySubmissions);
    await fixture.whenStable();
    const c = fixture.componentInstance;
    const o = {
      type: 'discover' as const,
      indexableObject: {
        uuid: 'no-meta',
        name: 'Fallback name',
        handle: '123/x',
        // metadata intencionalmente ausente
        inArchive: true,
        discoverable: true,
        withdrawn: false,
        lastModified: '2026-05-11T00:00:00Z',
        type: 'item',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(() => c.titleOf(o)).not.toThrow();
    expect(c.titleOf(o)).toBe('Fallback name');
    expect(() => c.issuedOf(o)).not.toThrow();
    expect(c.issuedOf(o)).toBe('');
    expect(() => c.entityTypeOf(o)).not.toThrow();
    expect(c.entityTypeOf(o)).toBe('—');
  });

  describe('Tipo column priority', () => {
    function buildWithType(uuid: string, dcType: string | null, entityType: string): {
      type: 'discover';
      indexableObject: {
        uuid: string;
        name: string;
        handle: string;
        metadata: Record<string, { value: string; language: null; authority: null; confidence: number; place: number }[]>;
        inArchive: boolean;
        discoverable: boolean;
        withdrawn: boolean;
        lastModified: string;
        type: string;
      };
    } {
      const metadata: Record<string, { value: string; language: null; authority: null; confidence: number; place: number }[]> = {
        'dc.title': [{ value: 'X', language: null, authority: null, confidence: -1, place: 0 }],
        'dspace.entity.type': [
          { value: entityType, language: null, authority: null, confidence: -1, place: 0 },
        ],
      };
      if (dcType !== null) {
        metadata['dc.type'] = [
          { value: dcType, language: null, authority: null, confidence: -1, place: 0 },
        ];
      }
      return {
        type: 'discover' as const,
        indexableObject: {
          uuid,
          name: 'X',
          handle: `123/${uuid}`,
          metadata,
          inArchive: true,
          discoverable: true,
          withdrawn: false,
          lastModified: '2026-05-11T00:00:00Z',
          type: 'item',
        },
      };
    }

    /** Verifica que dc.type tenga prioridad sobre dspace.entity.type para la columna Tipo. */
    it('should return dc.type when present (Video, Manual, Capacitación) instead of the entity-type', async () => {
      const fixture = TestBed.createComponent(MySubmissions);
      await fixture.whenStable();
      const c = fixture.componentInstance;

      expect(c.entityTypeOf(buildWithType('1', 'Video', 'Documento'))).toBe('Video');
      expect(c.entityTypeOf(buildWithType('2', 'Manual', 'Documento'))).toBe('Manual');
      expect(c.entityTypeOf(buildWithType('3', 'Capacitación', 'Galeria'))).toBe('Capacitación');
    });

    /** Verifica que el fallback sea dspace.entity.type cuando el item no trae dc.type. */
    it('should fall back to dspace.entity.type when dc.type is absent (Estadistica)', async () => {
      const fixture = TestBed.createComponent(MySubmissions);
      await fixture.whenStable();
      const c = fixture.componentInstance;

      expect(c.entityTypeOf(buildWithType('4', null, 'Estadistica'))).toBe('Estadistica');
    });
  });

  describe('withdrawn items actions', () => {
    function buildWithdrawnObject(uuid: string) {
      return {
        type: 'discover' as const,
        indexableObject: {
          uuid,
          name: 'Eliminado',
          handle: `123/${uuid}`,
          metadata: {
            'dc.title': [{ value: 'Eliminado', language: null, authority: null, confidence: -1, place: 0 }],
            'dspace.entity.type': [
              { value: 'Documento', language: null, authority: null, confidence: -1, place: 0 },
            ],
          },
          inArchive: false,
          discoverable: true,
          withdrawn: true,
          lastModified: '2026-05-12T15:24:19Z',
          type: 'item',
        },
      };
    }

    function setupWithWithdrawn() {
      searchFn.mockReturnValueOnce(
        of({ items: [buildWithdrawnObject('w-1')], totalElements: 1, totalPages: 1, size: 20, page: 0 }),
      );
      const fixture = TestBed.createComponent(MySubmissions);
      fixture.detectChanges();
      return fixture;
    }

    /** Verifica que `isWithdrawn` devuelva true cuando el flag nativo del item está prendido. */
    it('should expose isWithdrawn=true when indexableObject.withdrawn is true', async () => {
      const fixture = setupWithWithdrawn();
      await fixture.whenStable();
      const c = fixture.componentInstance;
      expect(c.isWithdrawn(buildWithdrawnObject('w-1'))).toBe(true);
    });

    /** Verifica que el botón Editar quede deshabilitado para items withdrawn. */
    it('should disable the Editar button when the item is withdrawn', async () => {
      const fixture = setupWithWithdrawn();
      await fixture.whenStable();
      fixture.detectChanges();

      const editBtn = fixture.nativeElement.querySelector(
        '[data-testid="action-edit"] button',
      ) as HTMLButtonElement | null;
      expect(editBtn).not.toBeNull();
      expect(editBtn!.disabled).toBe(true);
    });

    /** Verifica que el botón Eliminar quede deshabilitado para items withdrawn. */
    it('should disable the Eliminar button when the item is withdrawn', async () => {
      const fixture = setupWithWithdrawn();
      await fixture.whenStable();
      fixture.detectChanges();

      const deleteBtn = fixture.nativeElement.querySelector(
        '[data-testid="action-delete"] button',
      ) as HTMLButtonElement | null;
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn!.disabled).toBe(true);
    });

    /** Verifica que aparezca el botón Restaurar para items withdrawn. */
    it('should render the Restaurar button only for withdrawn items', async () => {
      const fixture = setupWithWithdrawn();
      await fixture.whenStable();
      fixture.detectChanges();

      const restoreBtn = fixture.nativeElement.querySelector(
        '[data-testid="action-restore"]',
      );
      expect(restoreBtn).not.toBeNull();
    });

    /** Verifica que `onRestore` confirme y dispare `restoreItem$` con el sufijo del caller. */
    it('should confirm and dispatch restoreItem$ with the caller sufijo when onRestore is called', async () => {
      const fixture = setupWithWithdrawn();
      await fixture.whenStable();
      fixture.componentInstance.onRestore('w-1');

      expect(confirmFn).toHaveBeenCalled();
      expect(restoreFn).toHaveBeenCalledWith('w-1', 'PEAC');
    });
  });

  describe('thumbnail fallback', () => {
    function buildObjectWithThumb(uuid: string) {
      return {
        type: 'discover' as const,
        indexableObject: {
          uuid,
          name: 'Con thumbnail roto',
          handle: `123/${uuid}`,
          metadata: {
            'dc.title': [{ value: 'X', language: null, authority: null, confidence: -1, place: 0 }],
          },
          thumbnail: { uuid: 'bs-roto', name: 'cover.jpg', type: 'bitstream' },
          inArchive: true,
          discoverable: true,
          withdrawn: false,
          lastModified: '2026-05-12T00:00:00Z',
          type: 'item',
        },
      };
    }

    /** Verifica que al fallar la carga del thumbnail se reemplace por el placeholder. */
    it('should fall back to the placeholder when the thumbnail image fails to load', async () => {
      searchFn.mockReturnValueOnce(
        of({ items: [buildObjectWithThumb('item-1')], totalElements: 1, totalPages: 1, size: 20, page: 0 }),
      );
      const fixture = TestBed.createComponent(MySubmissions);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
      expect(img).not.toBeNull();
      img!.dispatchEvent(new Event('error'));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('img')).toBeNull();
      expect(fixture.nativeElement.querySelector('i.pi-image')).not.toBeNull();
    });
  });

  describe('Recurso column', () => {
    function buildWithEntity(uuid: string, entityType: string | null) {
      const metadata: Record<string, { value: string; language: null; authority: null; confidence: number; place: number }[]> = {
        'dc.title': [{ value: 'X', language: null, authority: null, confidence: -1, place: 0 }],
      };
      if (entityType !== null) {
        metadata['dspace.entity.type'] = [
          { value: entityType, language: null, authority: null, confidence: -1, place: 0 },
        ];
      }
      return {
        type: 'discover' as const,
        indexableObject: {
          uuid,
          name: 'X',
          handle: `123/${uuid}`,
          metadata,
          inArchive: true,
          discoverable: true,
          withdrawn: false,
          lastModified: '2026-05-11T00:00:00Z',
          type: 'item',
        },
      };
    }

    /** Verifica que resourceTypeOf devuelva el dspace.entity.type del item. */
    it('should return dspace.entity.type for the Recurso column', async () => {
      const fixture = TestBed.createComponent(MySubmissions);
      await fixture.whenStable();
      const c = fixture.componentInstance;

      expect(c.resourceTypeOf(buildWithEntity('1', 'Documento'))).toBe('Documento');
      expect(c.resourceTypeOf(buildWithEntity('2', 'Galeria'))).toBe('Galeria');
      expect(c.resourceTypeOf(buildWithEntity('3', 'Estadistica'))).toBe('Estadistica');
    });

    /** Verifica que devuelva el guion cuando el item no trae dspace.entity.type. */
    it('should return "—" when dspace.entity.type is absent', async () => {
      const fixture = TestBed.createComponent(MySubmissions);
      await fixture.whenStable();
      const c = fixture.componentInstance;

      expect(c.resourceTypeOf(buildWithEntity('4', null))).toBe('—');
    });

    /** Verifica que el header "Recurso" se renderice entre Título y Tipo. */
    it('should render a Recurso column header between Título and Tipo', async () => {
      const fixture = TestBed.createComponent(MySubmissions);
      await fixture.whenStable();
      fixture.detectChanges();

      const headers = Array.from(
        fixture.nativeElement.querySelectorAll('thead th'),
      ).map((th) => (th as HTMLElement).textContent?.trim() ?? '');
      const titulo = headers.indexOf('Título');
      const recurso = headers.indexOf('Recurso');
      const tipo = headers.indexOf('Tipo');
      expect(recurso).toBeGreaterThan(titulo);
      expect(recurso).toBeLessThan(tipo);
    });
  });

  /**
   * Cubre el refresh automático de la bandeja cuando el usuario vuelve a
   * `/administrador/envios` desde la pantalla de edición o de carga.
   */
  describe('refresh on route re-entry', () => {
    /** Arma un stub de Router con `Subject` de eventos para emitir NavigationEnd a demanda. */
    function setupWithRouterStub() {
      const events$ = new Subject<NavigationEnd>();
      const navigateFn = vi.fn();
      TestBed.overrideProvider(Router, {
        useValue: {
          events: events$.asObservable(),
          navigate: navigateFn,
          url: '/administrador/envios',
        },
      });
      const fixture = TestBed.createComponent(MySubmissions);
      fixture.detectChanges();
      return { fixture, events$, navigateFn };
    }

    /** Verifica que al emitir NavigationEnd a `/administrador/envios` después del montaje inicial, la bandeja vuelva a pegar a `search$` con la página actual. */
    it('should reload the list when a NavigationEnd targets /administrador/envios after the initial mount', () => {
      const { events$ } = setupWithRouterStub();
      expect(searchFn).toHaveBeenCalledTimes(1);
      searchFn.mockClear();

      events$.next(new NavigationEnd(1, '/administrador/envios', '/administrador/envios'));

      expect(searchFn).toHaveBeenCalledWith(0, 20, expect.anything());
    });

    /** Verifica que NavigationEnd a una ruta distinta (ej. perfil) no dispare reload — el listener debe estar acotado a la propia URL. */
    it('should not reload when NavigationEnd targets a different route', () => {
      const { events$ } = setupWithRouterStub();
      searchFn.mockClear();

      events$.next(new NavigationEnd(2, '/administrador/perfil', '/administrador/perfil'));

      expect(searchFn).not.toHaveBeenCalled();
    });
  });
});
