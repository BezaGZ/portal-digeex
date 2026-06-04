import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { SubdireccionesDetail } from './subdirecciones-detail';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { Community } from '../../../core/api/models/community.model';
import { ProvenanceService } from '../../../core/services/provenance.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';

/**
 * Tests de `SubdireccionesDetail`.
 *
 * Container de la ruta `/administrador/subdirecciones/:uuid`. Resuelve el
 * recurso vía `CommunityApiService.getOne`, monta `<app-provenance-timeline>`
 * con las entradas derivadas por `ProvenanceService.extractFrom` y publica
 * el trail al `BreadcrumbService` cuando la sub resuelve.
 *
 * Ciclo 16 TDD — Sprint 8.
 */
describe('SubdireccionesDetail', () => {
  let getOneFn: Mock;
  let extractFromFn: Mock;
  let setTrailFn: Mock;

  function buildCommunity(uuid = 'community-1', overrides: Partial<Community> = {}): Community {
    return {
      uuid,
      name: 'Subdirección de Educación Básica',
      handle: '123456789/170',
      metadata: {
        'dc.title': [{ value: 'Subdirección de Educación Básica', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description': [{ value: 'Programas de educación básica extraescolar.', language: null, authority: null, confidence: -1, place: 0 }],
        'digeex.sufijo': [{ value: 'ED_BASICA', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description.provenance': [
          { value: 'Submitted by Mynor Ramos (mynor@mineduc.gob.gt) on 2026-06-04T05:50:51Z', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      archivedItemsCount: 11,
      type: 'community',
      ...overrides,
    };
  }

  beforeEach(async () => {
    getOneFn = vi.fn().mockReturnValue(of(buildCommunity()));
    extractFromFn = vi.fn().mockReturnValue([
      { timestamp: new Date('2026-06-04T05:50:51Z'), actor: 'Mynor Ramos', action: 'Submitted', raw: '...' },
    ]);
    setTrailFn = vi.fn();

    await TestBed.configureTestingModule({
      imports: [SubdireccionesDetail],
      providers: [
        provideNoopAnimations(),
        { provide: CommunityApiService, useValue: { getOne: getOneFn } },
        { provide: ProvenanceService, useValue: { extractFrom: extractFromFn } },
        { provide: BreadcrumbService, useValue: { setTrail: setTrailFn } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ uuid: 'community-1' })) },
        },
      ],
    }).compileComponents();
  });

  /** Verifica que el container invoque `CommunityApiService.getOne` con el `:uuid` del route param. */
  it('should call CommunityApiService.getOne with the uuid from the route param', () => {
    const fixture = TestBed.createComponent(SubdireccionesDetail);
    fixture.detectChanges();

    expect(getOneFn).toHaveBeenCalledTimes(1);
    expect(getOneFn).toHaveBeenCalledWith('community-1');
  });

  /** Verifica que mientras el observable está pendiente se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while the getOne observable is pending', () => {
    const pending = new Subject<Community>();
    getOneFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(SubdireccionesDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="subdireccion-detail-card"]')).toBeNull();
  });

  /** Verifica que cuando la sub resuelve se rendericen nombre, sufijo y descripción del metadata. */
  it('should render the name, sufijo and description from the metadata when the community resolves', () => {
    const fixture = TestBed.createComponent(SubdireccionesDetail);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="subdireccion-detail-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Subdirección de Educación Básica');
    expect(card.textContent).toContain('ED_BASICA');
    expect(card.textContent).toContain('Programas de educación básica extraescolar.');
  });

  /** Verifica que se monte `<app-provenance-timeline>` con las entries derivadas por `extractFrom`. */
  it('should mount <app-provenance-timeline> with the entries derived from extractFrom', () => {
    const fixture = TestBed.createComponent(SubdireccionesDetail);
    fixture.detectChanges();

    const timeline = fixture.nativeElement.querySelector('app-provenance-timeline');
    expect(timeline).not.toBeNull();
    expect(extractFromFn).toHaveBeenCalledTimes(1);
    expect(extractFromFn.mock.calls[0]?.[0]).toEqual(buildCommunity().metadata);
  });

  /** Verifica que cuando el metadata no tiene `dc.description.provenance` el timeline reciba `[]`. */
  it('should pass [] to <app-provenance-timeline> when extractFrom returns an empty array', () => {
    extractFromFn.mockReturnValue([]);

    const fixture = TestBed.createComponent(SubdireccionesDetail);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('[data-testid="provenance-timeline-empty"]');
    expect(empty).not.toBeNull();
  });

  /** Verifica que `BreadcrumbService.setTrail` se invoque con el trail correcto cuando la sub resuelve. */
  it('should call BreadcrumbService.setTrail with the correct trail when the community resolves', () => {
    const fixture = TestBed.createComponent(SubdireccionesDetail);
    fixture.detectChanges();

    expect(setTrailFn).toHaveBeenCalledTimes(1);
    const trail = setTrailFn.mock.calls[0]?.[0];
    expect(trail[0]).toMatchObject({ label: 'Subdirecciones', routerLink: ['/administrador'] });
    expect(trail[1]).toMatchObject({ label: 'Subdirección de Educación Básica' });
  });

  /** Verifica que ante un fallo del observable se renderice un fallback con `data-testid="subdireccion-detail-failed"`. */
  it('should render the failed fallback when getOne errors', () => {
    getOneFn.mockReturnValue(throwError(() => new Error('404 Not Found')));

    const fixture = TestBed.createComponent(SubdireccionesDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="subdireccion-detail-failed"]')).not.toBeNull();
  });
});
