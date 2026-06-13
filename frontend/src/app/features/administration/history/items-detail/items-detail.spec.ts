import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { ItemsDetail } from './items-detail';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { Item } from '../../../../core/api/models/item.model';
import { ProvenanceService } from '../../content/provenance/provenance.service';
import { BreadcrumbService } from '../../../../core/breadcrumb/breadcrumb.service';

/**
 * Tests de `ItemsDetail`.
 *
 * Container de la ruta `/administrador/historial/items/:uuid`.
 * Resuelve el item vía `ItemApiService.getOne` con el `:uuid`, monta
 * `<app-provenance-timeline>` con las entradas derivadas por
 * `ProvenanceService.extractFrom` y publica el trail al `BreadcrumbService`.
 *
 * Ciclo 18 TDD — Sprint 8. Ajustado en Ciclos 34 y 42.
 */
describe('ItemsDetail', () => {
  let getOneFn: Mock;
  let extractFromFn: Mock;
  let setTrailFn: Mock;

  function buildItem(uuid = 'item-1', overrides: Partial<Item> = {}): Item {
    return {
      uuid,
      name: '¿Quién Soy? — PEAC E1M1',
      handle: '123456789/300',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-06-04T05:50:51Z',
      type: 'item',
      metadata: {
        'dc.title': [{ value: '¿Quién Soy? — PEAC E1M1', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.contributor.author': [{ value: 'Equipo PEAC', language: null, authority: null, confidence: -1, place: 0 }],
        'dspace.entity.type': [{ value: 'Documento', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description.provenance': [
          { value: 'Submitted by Administrador DIGEEX (admin@mineduc.gob.gt) on 2026-06-04T05:50:51Z', language: null, authority: null, confidence: -1, place: 0 },
          { value: 'Made available in DSpace on 2026-06-04T05:50:51Z (GMT). No. of bitstreams: 1', language: null, authority: null, confidence: -1, place: 1 },
        ],
      },
      ...overrides,
    };
  }

  beforeEach(async () => {
    getOneFn = vi.fn().mockReturnValue(of(buildItem()));
    extractFromFn = vi.fn().mockReturnValue([
      { timestamp: new Date('2026-06-04T05:50:51Z'), actor: null, action: 'Made available', raw: '...' },
      { timestamp: new Date('2026-06-04T05:50:51Z'), actor: 'Administrador DIGEEX', action: 'Submitted', raw: '...' },
    ]);
    setTrailFn = vi.fn();

    await TestBed.configureTestingModule({
      imports: [ItemsDetail],
      providers: [
        provideNoopAnimations(),
        { provide: ItemApiService, useValue: { getOne: getOneFn } },
        { provide: ProvenanceService, useValue: { extractFrom: extractFromFn } },
        { provide: BreadcrumbService, useValue: { setTrail: setTrailFn } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ uuid: 'item-1' })),
          },
        },
      ],
    }).compileComponents();
  });

  /** Verifica que el container invoque `ItemApiService.getOne` con el `:uuid` del route param. */
  it('should call ItemApiService.getOne with the uuid from the route param', () => {
    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    expect(getOneFn).toHaveBeenCalledTimes(1);
    expect(getOneFn).toHaveBeenCalledWith('item-1');
  });

  /** Verifica que mientras el observable está pendiente se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while the getOne observable is pending', () => {
    const pending = new Subject<Item>();
    getOneFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="item-detail-card"]')).toBeNull();
  });

  /** Verifica que cuando el item resuelve se rendericen título, autor y tipo del metadata. */
  it('should render the title, author and entity type from the metadata when the item resolves', () => {
    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="item-detail-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('¿Quién Soy? — PEAC E1M1');
    expect(card.textContent).toContain('Equipo PEAC');
    expect(card.textContent).toContain('Documento');
  });

  /** Verifica que se monte `<app-provenance-timeline>` con las entries derivadas por `extractFrom`. */
  it('should mount <app-provenance-timeline> with the entries derived from extractFrom', () => {
    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    const timeline = fixture.nativeElement.querySelector('app-provenance-timeline');
    expect(timeline).not.toBeNull();
    expect(extractFromFn).toHaveBeenCalledTimes(1);
    expect(extractFromFn.mock.calls[0]?.[0]).toEqual(buildItem().metadata);
  });

  /** Verifica que el timeline renderice las entries pobladas cuando el metadata tiene `dc.description.provenance`. */
  it('should render the populated timeline when the metadata has dc.description.provenance entries', () => {
    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    const ol = fixture.nativeElement.querySelector('ol[aria-label="Historial de actividad"]');
    expect(ol).not.toBeNull();
    const items = ol.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(fixture.nativeElement.querySelector('[data-testid="provenance-timeline-empty"]')).toBeNull();
  });

  /**
   * Verifica que `BreadcrumbService.setTrail` se invoque con `[Programas, <title>, Historial]`.
   * El título va sin link (es la página actual) y la hoja identifica la vista.
   */
  it('should call BreadcrumbService.setTrail with [Programas, <title>, Historial] when the item resolves', () => {
    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    expect(setTrailFn).toHaveBeenCalledTimes(1);
    const trail = setTrailFn.mock.calls[0]?.[0];
    expect(trail[0]).toMatchObject({ label: 'Programas', routerLink: ['/administrador/programas'] });
    expect(trail[1]).toEqual({ label: '¿Quién Soy? — PEAC E1M1' });
    expect(trail[2]).toEqual({ label: 'Historial' });
  });

  /** Verifica que ante un fallo del observable se renderice un fallback con `data-testid="item-detail-failed"`. */
  it('should render the failed fallback when getOne errors', () => {
    getOneFn.mockReturnValue(throwError(() => new Error('404 Not Found')));

    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="item-detail-failed"]')).not.toBeNull();
  });

  /** Verifica que el estado de fallo muestre el componente compartido app-empty-state. */
  it('should render app-empty-state in the failed fallback when getOne errors', () => {
    getOneFn.mockReturnValue(throwError(() => new Error('404 Not Found')));

    const fixture = TestBed.createComponent(ItemsDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-empty-state')).not.toBeNull();
  });
});
