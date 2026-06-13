import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { ProgramasDetail } from './programas-detail';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { Collection } from '../../../core/api/models/collection.model';
import { ProvenanceService } from '../content/provenance/provenance.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';

/**
 * Tests de `ProgramasDetail`.
 *
 * Container de la ruta `/administrador/programas/:uuid`. Resuelve el programa
 * vía `CollectionApiService.getOne` con embed del logo, monta
 * `<app-provenance-timeline>` con las entradas derivadas por
 * `ProvenanceService.extractFrom` y publica el trail al `BreadcrumbService`.
 *
 * Ciclo 17 TDD — Sprint 8. Ajustado en Ciclo 34.
 */
describe('ProgramasDetail', () => {
  let getOneFn: Mock;
  let extractFromFn: Mock;
  let setTrailFn: Mock;

  function buildCollection(uuid = 'collection-1', overrides: Partial<Collection> = {}): Collection {
    return {
      uuid,
      name: 'Normativa y Acuerdos Institucionales',
      handle: '123456789/186',
      metadata: {
        'dc.title': [{ value: 'Normativa y Acuerdos Institucionales', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.title.alternative': [{ value: 'NORMATIVA', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description': [{ value: 'Marco legal, acuerdos ministeriales y normativa vigente.', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description.provenance': [
          { value: 'Submitted by Mynor (mynor@mineduc.gob.gt) on 2026-06-04T05:50:51Z', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      archivedItemsCount: 34,
      type: 'collection',
      ...overrides,
    };
  }

  beforeEach(async () => {
    getOneFn = vi.fn().mockReturnValue(of(buildCollection()));
    extractFromFn = vi.fn().mockReturnValue([
      { timestamp: new Date('2026-06-04T05:50:51Z'), actor: 'Mynor', action: 'Submitted', raw: '...' },
    ]);
    setTrailFn = vi.fn();

    await TestBed.configureTestingModule({
      imports: [ProgramasDetail],
      providers: [
        provideNoopAnimations(),
        { provide: CollectionApiService, useValue: { getOne: getOneFn } },
        { provide: ProvenanceService, useValue: { extractFrom: extractFromFn } },
        { provide: BreadcrumbService, useValue: { setTrail: setTrailFn } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ uuid: 'collection-1' })) },
        },
      ],
    }).compileComponents();
  });

  /** Verifica que el container invoque `CollectionApiService.getOne` con el `:uuid` y el embed del logo. */
  it('should call CollectionApiService.getOne with the uuid from the route param and embed=logo', () => {
    const fixture = TestBed.createComponent(ProgramasDetail);
    fixture.detectChanges();

    expect(getOneFn).toHaveBeenCalledTimes(1);
    expect(getOneFn).toHaveBeenCalledWith('collection-1', { embed: 'logo' });
  });

  /** Verifica que mientras el observable está pendiente se renderice el spinner compartido. */
  it('should render <app-loading-spinner> while the getOne observable is pending', () => {
    const pending = new Subject<Collection>();
    getOneFn.mockReturnValue(pending.asObservable());

    const fixture = TestBed.createComponent(ProgramasDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="programa-detail-card"]')).toBeNull();
  });

  /** Verifica que cuando la colección resuelve se rendericen nombre, sigla y descripción del metadata. */
  it('should render the name, sigla and description from the metadata when the collection resolves', () => {
    const fixture = TestBed.createComponent(ProgramasDetail);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="programa-detail-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Normativa y Acuerdos Institucionales');
    expect(card.textContent).toContain('NORMATIVA');
    expect(card.textContent).toContain('Marco legal, acuerdos ministeriales y normativa vigente.');
  });

  /** Verifica que la imagen del logo se renderice con la URL al bitstream cuando `_embedded.logo` viene presente. */
  it('should render the logo image with the bitstream URL when _embedded.logo is present', () => {
    getOneFn.mockReturnValueOnce(
      of(
        buildCollection('with-logo', {
          _embedded: {
            logo: {
              uuid: 'logo-bs-1',
              name: 'logo.png',
              handle: null,
              metadata: {},
              sizeBytes: 1024,
              checkSum: { checkSumAlgorithm: 'MD5', value: 'abc' },
              sequenceId: 1,
              type: 'bitstream',
            },
          },
        }),
      ),
    );

    const withLogoFixture = TestBed.createComponent(ProgramasDetail);
    withLogoFixture.detectChanges();
    const logoImg = withLogoFixture.nativeElement.querySelector('img[data-testid="programa-detail-logo"]');
    expect(logoImg).not.toBeNull();
    expect(logoImg.getAttribute('src')).toBe('/server/api/core/bitstreams/logo-bs-1/content');

    TestBed.resetTestingModule();
  });

  /** Verifica que se monte `<app-provenance-timeline>` con las entries derivadas por `extractFrom`. */
  it('should mount <app-provenance-timeline> with the entries derived from extractFrom', () => {
    const fixture = TestBed.createComponent(ProgramasDetail);
    fixture.detectChanges();

    const timeline = fixture.nativeElement.querySelector('app-provenance-timeline');
    expect(timeline).not.toBeNull();
    expect(extractFromFn).toHaveBeenCalledTimes(1);
    expect(extractFromFn.mock.calls[0]?.[0]).toEqual(buildCollection().metadata);
  });

  /**
   * Verifica que `BreadcrumbService.setTrail` se invoque con `[Programas, <nombre>, Historial]`.
   * El nombre va sin link (es la página actual) y la hoja identifica la vista.
   */
  it('should call BreadcrumbService.setTrail with [Programas, <name>, Historial] when the collection resolves', () => {
    const fixture = TestBed.createComponent(ProgramasDetail);
    fixture.detectChanges();

    expect(setTrailFn).toHaveBeenCalledTimes(1);
    const trail = setTrailFn.mock.calls[0]?.[0];
    expect(trail[0]).toMatchObject({ label: 'Programas', routerLink: ['/administrador/programas'] });
    expect(trail[1]).toEqual({ label: 'Normativa y Acuerdos Institucionales' });
    expect(trail[2]).toEqual({ label: 'Historial' });
  });

  /** Verifica que ante un fallo del observable se renderice un fallback con `data-testid="programa-detail-failed"`. */
  it('should render the failed fallback when getOne errors', () => {
    getOneFn.mockReturnValue(throwError(() => new Error('404 Not Found')));

    const fixture = TestBed.createComponent(ProgramasDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="programa-detail-failed"]')).not.toBeNull();
  });

  /** Verifica que el estado de fallo muestre el componente compartido app-empty-state. */
  it('should render app-empty-state in the failed fallback when getOne errors', () => {
    getOneFn.mockReturnValue(throwError(() => new Error('404 Not Found')));

    const fixture = TestBed.createComponent(ProgramasDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-empty-state')).not.toBeNull();
  });
});
