import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { ProgramViewComponent } from './program-view.component';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';

/**
 * Tests de ProgramViewComponent.
 *
 * Listado de items de un programa. El listado es lazy: no pre-carga
 * bitstreams. El thumbnail se obtiene directo del endpoint nativo
 * /api/core/items/{uuid}/thumbnail (un GET implícito al renderizar el <img>),
 * y el bundle ORIGINAL solo se consulta cuando el usuario da click en
 * "Descargar" desde el card.
 *
 * Ciclo 20 TDD — Sprint 6.
 */
describe('ProgramViewComponent', () => {
  let dspaceApi: DSpaceApiService;
  let collectionApi: CollectionApiService;

  const MOCK_COLLECTION = {
    uuid: 'col-1',
    name: 'PEAC',
    metadata: {
      'dspace.entity.type': [{ value: 'Documento' }],
      'dc.subject': [{ value: 'PEAC' }],
      'dc.title': [{ value: 'Programa PEAC' }],
    },
  };

  const MOCK_ITEMS_RESPONSE = {
    _embedded: {
      items: [
        {
          uuid: 'item-1',
          metadata: {
            'dc.title': [{ value: 'Documento 1' }],
            'dc.date.issued': [{ value: '2026' }],
            'dc.type': [{ value: 'Manual' }],
          },
          handle: '123/1',
        },
        {
          uuid: 'item-2',
          metadata: {
            'dc.title': [{ value: 'Documento 2' }],
            'dc.date.issued': [{ value: '2026' }],
            'dc.type': [{ value: 'Guía' }],
          },
          handle: '123/2',
        },
      ],
    },
    _links: {},
    page: { size: 8, totalElements: 2, totalPages: 1, number: 0 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgramViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: 'col-1' }) } },
      ],
    }).compileComponents();

    dspaceApi = TestBed.inject(DSpaceApiService);
    collectionApi = TestBed.inject(CollectionApiService);
    const breadcrumbService = TestBed.inject(BreadcrumbService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(collectionApi, 'getOne').mockReturnValue(of(MOCK_COLLECTION as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dspaceApi, 'getItems').mockReturnValue(of(MOCK_ITEMS_RESPONSE as any));
    vi.spyOn(dspaceApi, 'getBundles');
    vi.spyOn(dspaceApi, 'getBitstreamsFromBundle');
    vi.spyOn(breadcrumbService, 'setTrail');
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should create', () => {
    const fixture = TestBed.createComponent(ProgramViewComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  /** Verifica que el listado lazy no dispare llamadas a getBundles ni getBitstreamsFromBundle. */
  it('should NOT call getBundles or getBitstreamsFromBundle when loading the program list (lazy)', () => {
    const fixture = TestBed.createComponent(ProgramViewComponent);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    // El listado es lazy: cero peticiones JSON de bundles/bitstreams al renderizar la grilla.
    expect(dspaceApi.getBundles).not.toHaveBeenCalled();
    expect(dspaceApi.getBitstreamsFromBundle).not.toHaveBeenCalled();
  });

  /** Verifica que coverImage se pueble con la URL del endpoint nativo /thumbnail para cada item. */
  it('should populate coverImage with the native /thumbnail endpoint URL for every item', () => {
    const fixture = TestBed.createComponent(ProgramViewComponent);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    const items = fixture.componentInstance.items;
    expect(items.length).toBe(2);
    // El endpoint nativo devuelve el bitstream del bundle THUMBNAIL o 204 si
    // no existe; el <img> se encarga de fallback al onError.
    expect(items[0].coverImage).toBe('/server/api/core/items/item-1/thumbnail');
    expect(items[1].coverImage).toBe('/server/api/core/items/item-2/thumbnail');
  });

  /** Verifica que se prefiera el bitstream embebido del thumbnail sobre el endpoint nativo cuando existe. */
  it('should use the embedded thumbnail bitstream URL as coverImage when DSpace returns one', () => {
    // ?embed=thumbnail trae el bitstream del thumbnail en cada item; cuando
    // existe, lo preferimos sobre el endpoint nativo /items/{uuid}/thumbnail
    // que en DSpace 9 devuelve 204 si la portada manual no está asociada al
    // primary bitstream del ORIGINAL.
    vi.spyOn(dspaceApi, 'getItems').mockReturnValue(
      of({
        _embedded: {
          items: [
            {
              uuid: 'item-with-thumb',
              metadata: { 'dc.title': [{ value: 'Con portada' }] },
              handle: '123/9',
              thumbnail: { uuid: 'thumb-bs-9', name: 'portada.jpg', type: 'bitstream' },
            },
          ],
        },
        _links: {},
        page: { size: 8, totalElements: 1, totalPages: 1, number: 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );

    const fixture = TestBed.createComponent(ProgramViewComponent);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.items[0].coverImage).toBe(
      '/server/api/core/bitstreams/thumb-bs-9/content',
    );
  });

  /** Verifica que cada ItemView del listado quede con bitstreams vacíos hasta el click de descarga. */
  it('should leave bitstreams empty in the listed ItemView (hydrated only on download click)', () => {
    const fixture = TestBed.createComponent(ProgramViewComponent);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    const items = fixture.componentInstance.items;
    expect(items[0].bitstreams).toEqual([]);
    expect(items[1].bitstreams).toEqual([]);
  });
});
