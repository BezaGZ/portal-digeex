import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EMPTY, Subject, of } from 'rxjs';

import { MySubmissions } from './my-submissions';
import { MyDSpaceApiService } from '../../../../core/api/my-dspace-api.service';
import { ItemAdminFacade } from '../../content/services/item-admin-facade';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { ConfirmationService } from 'primeng/api';

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
 * Ciclo 31 TDD — Sprint 6.
 */
describe('MySubmissions', () => {
  let searchFn: ReturnType<typeof vi.fn>;
  let withdrawFn: ReturnType<typeof vi.fn>;
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
    confirmFn = vi.fn().mockImplementation((opts: { accept?: () => void }) => opts.accept?.());

    TestBed.configureTestingModule({
      imports: [MySubmissions],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: MyDSpaceApiService, useValue: { search$: searchFn } },
        { provide: ItemAdminFacade, useValue: { withdrawItem$: withdrawFn } },
        {
          provide: AuthCallerService,
          useValue: { currentCaller$: of({ role: 'superadmin', sufijo: 'PEAC' }) },
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
});
