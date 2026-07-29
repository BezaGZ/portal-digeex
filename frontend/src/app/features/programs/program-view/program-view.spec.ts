import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { ProgramView } from './program-view';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { BitstreamDownloadService } from '../../../core/api/bitstream-download.service';

/**
 * Tests de ProgramView.
 *
 * Listado de items de un programa. El listado es lazy: no pre-carga
 * bitstreams. El thumbnail se obtiene directo del endpoint nativo
 * /api/core/items/{uuid}/thumbnail (un GET implícito al renderizar el <img>),
 * y el bundle ORIGINAL solo se consulta cuando el usuario da click en
 * "Descargar" desde el card.
 *
 * Ciclo 20 TDD — Sprint 6. Ajustado en Ciclo 15 (Sprint 9) y el 29/07/2026
 * (header con título largo + descripción, sigla solo en breadcrumb, fuera de sprint).
 */
describe('ProgramView', () => {
  let dspaceApi: DSpaceApiService;
  let collectionApi: CollectionApiService;

  const MOCK_COLLECTION = {
    uuid: 'col-1',
    name: 'fallback',
    metadata: {
      'dspace.entity.type': [{ value: 'Documento' }],
      'dc.title.alternative': [{ value: 'PEAC' }],
      'dc.subject': [{ value: 'tag-irrelevante' }],
      'dc.title': [{ value: 'Programa PEAC' }],
      'dc.description': [{ value: 'Descripción curada del programa' }],
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
      imports: [ProgramView],
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
    const fixture = TestBed.createComponent(ProgramView);
    expect(fixture.componentInstance).toBeTruthy();
  });

  /**
   * Verifica que el header muestre dc.title como nombre y dc.description como
   * descripción, alineado con galería y estadística. La sigla dejó el header
   * y vive solo en el breadcrumb.
   */
  it('should show dc.title as name and dc.description as description in the header', () => {
    const fixture = TestBed.createComponent(ProgramView);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.currentNode()?.name).toBe('Programa PEAC');
    expect(fixture.componentInstance.currentNode()?.description).toBe(
      'Descripción curada del programa',
    );
  });

  /**
   * Verifica que sin dc.description la descripción quede vacía y el párrafo
   * no se renderice: repetir el título largo como descripción era redundante.
   */
  it('should leave the description empty and hide the paragraph when dc.description is missing', () => {
    const collectionWithoutDescription = {
      ...MOCK_COLLECTION,
      metadata: { ...MOCK_COLLECTION.metadata, 'dc.description': undefined },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(collectionApi, 'getOne').mockReturnValue(of(collectionWithoutDescription as any));

    const fixture = TestBed.createComponent(ProgramView);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.currentNode()?.description).toBe('');
    expect(fixture.nativeElement.querySelector('.page-subtitle')).toBeNull();
  });

  /** Verifica que el breadcrumb conserve la sigla de dc.title.alternative, no el título largo. */
  it('should keep the acronym from dc.title.alternative in the breadcrumb trail', () => {
    const breadcrumbService = TestBed.inject(BreadcrumbService);

    const fixture = TestBed.createComponent(ProgramView);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    const setTrailSpy = breadcrumbService.setTrail as ReturnType<typeof vi.fn>;
    const lastTrail = setTrailSpy.mock.calls.at(-1)?.[0] as { label: string }[];
    expect(lastTrail.at(-1)?.label).toBe('PEAC');
  });

  /** Verifica que el listado lazy no dispare llamadas a getBundles ni getBitstreamsFromBundle. */
  it('should NOT call getBundles or getBitstreamsFromBundle when loading the program list (lazy)', () => {
    const fixture = TestBed.createComponent(ProgramView);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    // El listado es lazy: cero peticiones JSON de bundles/bitstreams al renderizar la grilla.
    expect(dspaceApi.getBundles).not.toHaveBeenCalled();
    expect(dspaceApi.getBitstreamsFromBundle).not.toHaveBeenCalled();
  });

  /** Verifica que coverImage se pueble con la URL del endpoint nativo /thumbnail para cada item. */
  it('should populate coverImage with the native /thumbnail endpoint URL for every item', () => {
    const fixture = TestBed.createComponent(ProgramView);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    const items = fixture.componentInstance.items();
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

    const fixture = TestBed.createComponent(ProgramView);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.items()[0].coverImage).toBe(
      '/server/api/core/bitstreams/thumb-bs-9/content',
    );
  });

  /** Verifica que cada ItemView del listado quede con bitstreams vacíos hasta el click de descarga. */
  it('should leave bitstreams empty in the listed ItemView (hydrated only on download click)', () => {
    const fixture = TestBed.createComponent(ProgramView);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    const items = fixture.componentInstance.items();
    expect(items[0].bitstreams).toEqual([]);
    expect(items[1].bitstreams).toEqual([]);
  });

  /**
   * Verifica que la descarga del card agote todas las páginas del bundle
   * ORIGINAL: un documento con más de una página de archivos (totalElements
   * mayor que el tamaño de página) debe entregar todos sus archivos al
   * downloader, no solo los primeros 20.
   */
  it('should exhaust every page of the ORIGINAL bundle on download', async () => {
    const downloader = TestBed.inject(BitstreamDownloadService);
    const downloadAuto = vi
      .spyOn(downloader, 'downloadAuto')
      .mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(
      of({
        _embedded: { bundles: [{ uuid: 'orig-1', name: 'ORIGINAL', _links: {} }] },
        _links: {},
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page0 = { _embedded: { bitstreams: Array.from({ length: 20 }, (_, i) => ({ uuid: `bs-${i}`, name: `a-${i}.pdf`, sizeBytes: 1 })) }, _links: {}, page: { size: 20, totalElements: 25, totalPages: 2, number: 0 } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page1 = { _embedded: { bitstreams: Array.from({ length: 5 }, (_, i) => ({ uuid: `bs-2${i}`, name: `b-${i}.pdf`, sizeBytes: 1 })) }, _links: {}, page: { size: 20, totalElements: 25, totalPages: 2, number: 1 } };
    vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_uuid: string, page = 0) => of((page === 0 ? page0 : page1) as any),
    );

    const fixture = TestBed.createComponent(ProgramView);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fixture.componentInstance.onDownloadItem({ id: 'item-1', name: 'Documento 1', bitstreams: [] } as any);
    await new Promise((resolve) => setTimeout(resolve));

    expect(downloadAuto).toHaveBeenCalledTimes(1);
    expect(downloadAuto.mock.calls[0][0].length).toBe(25);
  });
});
