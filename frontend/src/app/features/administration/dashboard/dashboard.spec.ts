import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { Mock, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';

import { Dashboard } from './dashboard';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { Caller } from '../content/specifications/scope-context.model';
import { Community } from '../../../core/api/models/community.model';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';

/**
 * Tests del contenedor Dashboard data-driven.
 *
 * Verifica resolución de scope por rol (SuperAdmin → null;
 * admin_subdireccion → UUID de su sub vía `findCallerSub`), selección de
 * widgets desde `DASHBOARD_WIDGETS_BY_ROLE` y el handler de click del
 * top-list-card que navega a la pantalla de Programas. Los servicios de
 * los widgets se mockean para no disparar HTTP real.
 *
 * Ciclo 12 TDD — Sprint 8. Ajustado en Ciclos 13 y 28 (Sprint 8) y 2026-06-21
 * (fail-closed: sin sub válida no se renderizan widgets globales) y Ciclo 34 (Sprint 10).
 */
describe('Dashboard', () => {
  let caller$: BehaviorSubject<Caller | null>;
  let searchTopFn: Mock;
  let listAllSubcommunitiesFn: Mock;
  let routerNavigateFn: Mock;

  function buildCommunity(uuid: string, name: string, sufijo: string): Community {
    return {
      uuid,
      name,
      handle: `123/${uuid}`,
      archivedItemsCount: 0,
      type: 'community',
      metadata: {
        'digeex.sufijo': [
          { value: sufijo, language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };
  }

  beforeEach(async () => {
    caller$ = new BehaviorSubject<Caller | null>(null);

    searchTopFn = vi.fn().mockReturnValue(
      of({
        _embedded: { communities: [buildCommunity('digeex-root', 'DIGEEX', '')] },
        _links: { self: { href: '/' } },
        page: { size: 1, totalElements: 1, totalPages: 1, number: 0 },
      }),
    );
    listAllSubcommunitiesFn = vi.fn().mockReturnValue(
      of([
        buildCommunity('sub-1', 'Educación Básica', 'ED_BASICA'),
        buildCommunity('sub-2', 'Trabajo', 'ED_TRABAJO'),
      ]),
    );
    routerNavigateFn = vi.fn();

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        { provide: Router, useValue: { navigate: routerNavigateFn } },
        { provide: AuthCallerService, useValue: { currentCaller$: caller$.asObservable() } },
        {
          provide: CommunityApiService,
          useValue: { searchTop: searchTopFn, listAllSubcommunities: listAllSubcommunitiesFn },
        },
        // Stubs para que los widgets hijos no exploten al renderizarse en el test.
        // Devuelven observables vacíos que mantienen el widget en spinner.
        {
          provide: DiscoveryService,
          useValue: { search: vi.fn(() => of({ items: [], facets: [], totalElements: 0, totalPages: 0, page: 0, size: 0 })) },
        },
        {
          provide: CollectionApiService,
          useValue: {
            listAll: vi.fn(() => of([])),
            listAllByCommunity: vi.fn(() => of([])),
          },
        },
      ],
    }).compileComponents();
  });

  /** Verifica que mientras el caller no resuelve se muestre el estado de loading. */
  it('should render the loading state while the caller is still null', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-loading"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-widget-grid"]')).toBeNull();
  });

  /** Verifica que el estado de carga use el spinner compartido, no un texto suelto. */
  it('should render the shared app-loading-spinner while loading', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
  });

  /**
   * Verifica que para SuperAdmin el scope sea null (universal) y se rendericen
   * los 4 widgets del rol desde DASHBOARD_WIDGETS_BY_ROLE.
   */
  it('should resolve scope=null and render superadmin widgets when caller is superadmin', () => {
    caller$.next({ role: 'superadmin', sufijo: null });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(fixture.componentInstance.scope()).toBeNull();
    expect(fixture.componentInstance.widgets().length).toBe(4);
    // No necesita buscar la sub porque es SuperAdmin.
    expect(searchTopFn).not.toHaveBeenCalled();
    expect(listAllSubcommunitiesFn).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-widget-grid"]')).not.toBeNull();
  });

  /**
   * Verifica que para admin_subdireccion el scope se resuelva al UUID
   * de la community que matchea su sufijo, vía searchTop + listAllSubcommunities.
   */
  it('should resolve scope to the community uuid of the caller sufijo when role is admin_subdireccion', () => {
    caller$.next({ role: 'admin_subdireccion', sufijo: 'ED_BASICA' });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(searchTopFn).toHaveBeenCalled();
    expect(listAllSubcommunitiesFn).toHaveBeenCalledWith('digeex-root');
    expect(fixture.componentInstance.scope()).toBe('sub-1');
    expect(fixture.componentInstance.widgets().length).toBe(4);
  });

  /**
   * Fail-closed: si el caller tiene un sufijo que no matchea ninguna sub, el
   * dashboard NO renderiza sus widgets (que pedirían stats globales con scope
   * null); muestra el empty state. Cierra el fail-open de un admin_sub sin sub
   * válida que veía métricas de todas las subdirecciones.
   */
  it('should render the empty state instead of global widgets when the caller sufijo does not match any sub', () => {
    caller$.next({ role: 'admin_subdireccion', sufijo: 'NO_EXISTE' });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-widget-grid"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-empty"]')).not.toBeNull();
  });

  /**
   * Verifica que un rol sin entrada en la matriz vea mensaje empty y no
   * dispare ni una sola llamada de widget.
   */
  it('should render the empty state for roles without entries in DASHBOARD_WIDGETS_BY_ROLE', () => {
    caller$.next({ role: 'personal_delegado', sufijo: 'ED_BASICA' });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(fixture.componentInstance.widgets().length).toBe(0);
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-empty"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-widget-grid"]')).toBeNull();
  });

  /** Verifica que onTopListEntryClick navegue a /administrador/historial/programas/<uuid>. */
  it('should navigate to /administrador/historial/programas/<uuid> when onTopListEntryClick fires', () => {
    caller$.next({ role: 'superadmin', sufijo: null });

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    fixture.componentInstance.onTopListEntryClick({
      uuid: 'coll-peac',
      label: 'PEAC',
      count: 34,
    });

    expect(routerNavigateFn).toHaveBeenCalledWith(['/administrador/historial/programas', 'coll-peac']);
  });

  /** Verifica que el signal `selectedYearWindow` arranque en 5 (default del filtro temporal). */
  it('should default selectedYearWindow to 5 years', () => {
    caller$.next({ role: 'superadmin', sufijo: null });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedYearWindow()).toBe(5);
  });

  /**
   * Verifica que `yearRanges` computed devuelva N rangos cuando el signal cambia.
   * El array sale del helper `buildLastNYearRanges` y se inyecta como input a `range-bar-card`.
   */
  it('should expose yearRanges with one entry per year of the selected window', () => {
    caller$.next({ role: 'superadmin', sufijo: null });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    fixture.componentInstance.selectedYearWindow.set(3);
    fixture.detectChanges();

    expect(fixture.componentInstance.yearRanges().length).toBe(3);
  });

  /** Verifica que el dropdown del filtro temporal exista en el HTML con su data-testid. */
  it('should render the year-window dropdown with the expected data-testid', () => {
    caller$.next({ role: 'superadmin', sufijo: null });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="dashboard-year-window-select"]'),
    ).not.toBeNull();
  });
});
