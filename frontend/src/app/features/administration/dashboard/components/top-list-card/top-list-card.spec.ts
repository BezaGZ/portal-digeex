import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { TopListCard } from './top-list-card';
import { CollectionApiService } from '../../../../../core/api/collection-api.service';
import { Collection } from '../../../../../core/api/models/collection.model';

/**
 * Tests del widget top-list-card del Dashboard de KPIs.
 *
 * El widget pide todas las colecciones del scope vía
 * `CollectionApiService.listAll`/`listAllByCommunity`, rankea por
 * `archivedItemsCount` desc y muestra las primeras `limit` filas.
 * Cuatro estados: spinner, lista, empty, `—` ante error.
 *
 * Ciclo 11 TDD — Sprint 8. Ajustado en Ciclo 12 (Sprint 8).
 */
describe('TopListCard', () => {
  let listAllByCommunityFn: Mock;
  let listAllFn: Mock;

  function buildCollection(uuid: string, name: string, archivedItemsCount: number): Collection {
    return {
      uuid,
      name,
      type: 'collection',
      handle: `123/${uuid}`,
      archivedItemsCount,
      metadata: {
        'dc.title': [{ value: name, language: null, authority: null, confidence: -1, place: 0 }],
      },
      _links: { self: { href: `/collections/${uuid}` } },
    } as Collection;
  }

  beforeEach(async () => {
    const peac = buildCollection('coll-peac', 'PEAC', 45);
    const pronea = buildCollection('coll-pronea', 'PRONEA', 12);
    const modf = buildCollection('coll-modf', 'Modalidades Flexibles', 8);

    listAllByCommunityFn = vi.fn().mockReturnValue(of([peac, pronea, modf]));
    listAllFn = vi.fn().mockReturnValue(of([peac, pronea, modf]));

    await TestBed.configureTestingModule({
      imports: [TopListCard],
      providers: [
        provideNoopAnimations(),
        {
          provide: CollectionApiService,
          useValue: {
            listAllByCommunity: listAllByCommunityFn,
            listAll: listAllFn,
          },
        },
      ],
    }).compileComponents();
  });

  /** Verifica que con scope=UUID se invoque listAllByCommunity (paginación recursiva). */
  it('should call listAllByCommunity once when scope is a community uuid', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', 'community-uuid-001');
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    expect(listAllByCommunityFn).toHaveBeenCalledTimes(1);
    expect(listAllByCommunityFn.mock.calls[0]?.[0]).toBe('community-uuid-001');
    expect(listAllFn).not.toHaveBeenCalled();
  });

  /** Verifica que con scope=null se invoque listAll (paginación recursiva del repo). */
  it('should call listAll() once when scope is null', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    expect(listAllFn).toHaveBeenCalledTimes(1);
    expect(listAllByCommunityFn).not.toHaveBeenCalled();
  });

  /** Verifica que mientras el listing está pendiente se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while the listing observable is pending', () => {
    const pending = new Subject<Collection[]>();
    listAllFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="top-list-card-row"]')).toBeNull();
  });

  /** Verifica que al resolver se rendericen las filas ordenadas por count desc. */
  it('should render the entries ordered by archivedItemsCount desc', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="top-list-card-row"]');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('PEAC');
    expect(rows[0].textContent).toContain('45');
    expect(rows[1].textContent).toContain('PRONEA');
    expect(rows[2].textContent).toContain('Modalidades Flexibles');
  });

  /** Verifica que el input limit acote el render a los primeros N items. */
  it('should truncate the rendered list to `limit` entries when there are more collections', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top 2');
    fixture.componentRef.setInput('limit', 2);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="top-list-card-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('PEAC');
    expect(rows[1].textContent).toContain('PRONEA');
  });

  /** Verifica que al hacer click en una fila se emita el output entryClicked con uuid+label+count. */
  it('should emit entryClicked with the selected entry when a row is clicked', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    let emitted: { uuid: string; label: string; count: number } | null = null;
    fixture.componentInstance.entryClicked.subscribe((e) => (emitted = e));

    const firstRowBtn = fixture.nativeElement.querySelector(
      '[data-testid="top-list-card-row"]',
    ) as HTMLButtonElement;
    firstRowBtn.click();
    fixture.detectChanges();

    expect(emitted).toEqual({ uuid: 'coll-peac', label: 'PEAC', count: 45 });
  });

  /** Verifica que cuando el listing devuelve cero colecciones se renderice empty-state. */
  it('should render an empty-state message when the scope has no collections', () => {
    listAllFn.mockReturnValue(of([]));

    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    const emptyEl = fixture.nativeElement.querySelector('[data-testid="top-list-card-empty"]');
    expect(emptyEl).not.toBeNull();
  });

  /** Verifica que ante un fallo del listing se renderice `—` como fallback silencioso. */
  it('should render "—" when the listing observable errors', () => {
    listAllFn.mockReturnValue(throwError(() => new Error('502 Bad Gateway')));

    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    const failedEl = fixture.nativeElement.querySelector('[data-testid="top-list-card-failed"]');
    expect(failedEl).not.toBeNull();
    expect(failedEl.textContent.trim()).toBe('—');
  });

  /**
   * Verifica que un `archivedItemsCount` negativo (feature strengths off en el
   * backend) se trate como 0 para que el ranking no se ensucie con `-1`s.
   * Defensivo: el widget no debe asumir que la config del servidor está bien.
   */
  it('should clamp a negative archivedItemsCount to 0 (defensive against strengths off)', () => {
    const peac = buildCollection('coll-peac', 'PEAC', 45);
    const broken = buildCollection('coll-broken', 'Sin conteo', -1);
    listAllFn.mockReturnValue(of([peac, broken]));

    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones');
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="top-list-card-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('PEAC');
    expect(rows[0].textContent).toContain('45');
    expect(rows[1].textContent).toContain('Sin conteo');
    expect(rows[1].textContent).toContain('0');
  });

  /** Verifica que el label input se renderice como título del card. */
  it('should render the label input as the card title', () => {
    const fixture = TestBed.createComponent(TopListCard);
    fixture.componentRef.setInput('scope', null);
    fixture.componentRef.setInput('label', 'Top colecciones del sistema');
    fixture.detectChanges();

    const labelEl = fixture.nativeElement.querySelector('[data-testid="top-list-card-label"]');
    expect(labelEl).not.toBeNull();
    expect(labelEl.textContent.trim()).toBe('Top colecciones del sistema');
  });
});
