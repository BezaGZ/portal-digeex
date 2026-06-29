import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { DocumentDetail } from './document-detail';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { VocabularyDisplayService } from '../../../core/api/vocabulary-display.service';
import { LoadingService } from '../../../core/loading';

/**
 * Tests para DocumentDetail.
 *
 * Vista detalle de recurso: carga metadata completa de un item
 * DSpace por UUID, muestra thumbnail, bitstreams descargables,
 * y soporta documentos PDF y videos (MovingImage).
 *
 * Ciclo 4 TDD — Sprint 4. Ajustado en Ciclo 36 (Sprint 6), Ciclo 12, Ciclo 13 y Ciclo 14 (Sprint 9)
 * y Ciclo 38 (Sprint 10).
 */

describe('DocumentDetail', () => {
  let component: DocumentDetail;
  let dspaceApi: DSpaceApiService;
  let collectionApi: CollectionApiService;
  let breadcrumbService: BreadcrumbService;
  let vocabDisplay: VocabularyDisplayService;

  /** Fixtures */

  // La portada curada viaja como item.thumbnail (embed=thumbnail), igual que
  // en los listados de Discovery; el detalle ya no la lee del bundle THUMBNAIL.
  const MOCK_ITEM_DOC = {
    uuid: 'item-doc-001',
    name: 'Guía Curricular PEAC',
    handle: '123456789/10',
    metadata: {
      'dc.title': [{ value: 'Guía Curricular PEAC' }],
      'dc.description.abstract': [{ value: 'Guía para el programa PEAC de educación.' }],
      'dc.contributor.author': [{ value: 'DIGEEX' }],
      'dc.date.issued': [{ value: '2025' }],
      'dc.type': [{ value: 'Guía' }],
      'dcterms.educationLevel': [{ value: 'Primaria' }],
      'dc.subject': [{ value: 'Educación' }, { value: 'PEAC' }],
      'dc.language.iso': [{ value: 'es' }],
      'dc.publisher': [{ value: 'MINEDUC' }],
    },
    thumbnail: { uuid: 'thumb-bs-001', name: 'guia-peac.jpg', sizeBytes: 5000, _links: {} },
    inArchive: true,
    discoverable: true,
    withdrawn: false,
    lastModified: '2025-03-15',
    type: 'item',
  };

  const MOCK_ITEM_VIDEO = {
    uuid: 'item-video-001',
    name: 'Capacitación docente 2025',
    handle: '123456789/20',
    metadata: {
      'dc.title': [{ value: 'Capacitación docente 2025' }],
      'dc.description.abstract': [{ value: 'Video de capacitación.' }],
      'dc.type': [{ value: 'Video' }],
      'dc.relation.uri': [{ value: 'https://youtube.com/watch?v=abc123' }],
      'dc.contributor.author': [{ value: 'DIGEEX' }],
      'dc.date.issued': [{ value: '2025-06-10' }],
      'dc.language.iso': [{ value: 'es' }],
    },
    inArchive: true,
    discoverable: true,
    withdrawn: false,
    lastModified: '2025-06-10',
    type: 'item',
  };

  // Bundles con los bitstreams del ORIGINAL embebidos (embed=bitstreams): el
  // detalle los lee de _embedded.bitstreams._embedded.bitstreams sin una
  // petición por bundle. El bundle THUMBNAIL ya no se consulta.
  const MOCK_BUNDLES = {
    _embedded: {
      bundles: [
        { uuid: 'thumb-bundle-001', name: 'THUMBNAIL', handle: '', type: 'bundle', _links: {} },
        {
          uuid: 'orig-bundle-001',
          name: 'ORIGINAL',
          handle: '',
          type: 'bundle',
          _links: {},
          _embedded: {
            bitstreams: {
              _embedded: {
                bitstreams: [
                  { uuid: 'orig-bs-001', name: 'guia-peac.pdf', sizeBytes: 245000, _links: {} },
                ],
              },
              page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
            },
          },
        },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
  };

  // Variante con dos archivos en el ORIGINAL (PDF + Word) para los casos de
  // listado múltiple y descarga en ZIP.
  const MOCK_BUNDLES_MULTI = {
    _embedded: {
      bundles: [
        { uuid: 'thumb-bundle-001', name: 'THUMBNAIL', handle: '', type: 'bundle', _links: {} },
        {
          uuid: 'orig-bundle-001',
          name: 'ORIGINAL',
          handle: '',
          type: 'bundle',
          _links: {},
          _embedded: {
            bitstreams: {
              _embedded: {
                bitstreams: [
                  { uuid: 'orig-bs-001', name: 'guia-peac.pdf', sizeBytes: 245000, _links: {} },
                  { uuid: 'orig-bs-002', name: 'anexo.docx', sizeBytes: 50000, _links: {} },
                ],
              },
              page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
            },
          },
        },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
  };

  // Sin portada curada: el ORIGINAL trae una imagen, para verificar el fallback.
  const MOCK_BUNDLES_IMAGE = {
    _embedded: {
      bundles: [
        {
          uuid: 'orig-bundle-001',
          name: 'ORIGINAL',
          handle: '',
          type: 'bundle',
          _links: {},
          _embedded: {
            bitstreams: {
              _embedded: {
                bitstreams: [
                  { uuid: 'orig-img-001', name: 'portada.jpg', sizeBytes: 8000, _links: {} },
                ],
              },
              page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
            },
          },
        },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
  };

  /** Setup */

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { params: of({ docId: 'item-doc-001', id: 'program-001' }) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DocumentDetail);
    component = fixture.componentInstance;
    dspaceApi = TestBed.inject(DSpaceApiService);
    collectionApi = TestBed.inject(CollectionApiService);
    breadcrumbService = TestBed.inject(BreadcrumbService);
    vocabDisplay = TestBed.inject(VocabularyDisplayService);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(MOCK_ITEM_DOC as any));
    vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(MOCK_BUNDLES as any));
    // El detalle ya no pide bitstreams por bundle; se espía vacío para poder
    // afirmar que no se invoca y para que un descuido no pegue a la red.
    vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockReturnValue(
      of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any),
    );
    vi.spyOn(collectionApi, 'getOne').mockReturnValue(of({ name: 'fallback', metadata: { 'dc.title.alternative': [{ value: 'PEAC' }], 'dc.subject': [{ value: 'tag-irrelevante' }] } } as any));
    vi.spyOn(breadcrumbService, 'setTrail');
    // Mock del servicio de vocabularios: traduce los pares conocidos y cae al
    // value crudo para cualquier otro, replicando el contrato del servicio real.
    vi.spyOn(vocabDisplay, 'display$').mockImplementation((name: string, value: string) => {
      if (name === 'idiomas-digeex' && value === 'es') return of('Español');
      if (name === 'idiomas-digeex' && value === 'acr') return of('Achi');
      if (name === 'niveles-educativos' && value === 'Primaria') return of('Primaria');
      if (name === 'tipos-documento' && value === 'Guía') return of('Guía');
      return of(value);
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /** Carga de item y metadata */

  describe('item loading', () => {
    /** Verifica que extraiga docId de la ruta y pida el item con embed=thumbnail. */
    it('should extract docId from route params and request the item with embed=thumbnail', () => {
      component.ngOnInit();

      expect(component.documentId).toBe('item-doc-001');
      expect(component.programId).toBe('program-001');
      expect(dspaceApi.getItem).toHaveBeenCalledWith('item-doc-001', 'thumbnail');
    });

    /** Verifica que los campos de metadata se mapeen correctamente al UI. */
    it('should display metadata fields from item response', () => {
      component.ngOnInit();

      expect(component.documentTitle()).toBe('Guía Curricular PEAC');
      expect(component.documentDescription()).toBe('Guía para el programa PEAC de educación.');

      const labels = component.metadataFields().map((f) => f.label);
      expect(labels).toContain('Autor / Área responsable');
      expect(labels).toContain('Fecha de publicación');
      expect(labels).toContain('Tipo de documento');
      expect(labels).toContain('Nivel educativo');
      expect(labels).toContain('Palabras clave');
      expect(labels).toContain('Idioma');
      expect(labels).toContain('Publicado por');

      const autorField = component.metadataFields().find((f) => f.label === 'Autor / Área responsable');
      expect(autorField?.value).toBe('DIGEEX');
      expect(autorField?.type).toBe('text');

      const keywordsField = component.metadataFields().find((f) => f.label === 'Palabras clave');
      expect(keywordsField?.value).toEqual(['Educación', 'PEAC']);
      expect(keywordsField?.type).toBe('list');

      const idiomaField = component.metadataFields().find((f) => f.label === 'Idioma');
      expect(idiomaField?.value).toBe('Español');
    });
  });

  /** Portada, bundles y bitstreams */

  describe('cover, bundles and bitstreams', () => {
    /** Verifica las proyecciones embed: thumbnail en el item, bitstreams en los bundles. */
    it('should request the item with embed=thumbnail and the bundles with embed=bitstreams', () => {
      component.ngOnInit();

      expect(dspaceApi.getItem).toHaveBeenCalledWith('item-doc-001', 'thumbnail');
      expect(dspaceApi.getBundles).toHaveBeenCalledWith('item-doc-001', 0, 20, 'bitstreams');
    });

    /**
     * Verifica que la portada salga de item.thumbnail (la portada curada) y que
     * no haya petición de bitstreams por bundle: el ahorro del ciclo.
     */
    it('should set the cover from item.thumbnail without requesting bitstreams per bundle', () => {
      component.ngOnInit();

      expect(component.documentCoverImage()).toBe('/server/api/core/bitstreams/thumb-bs-001/content');
      expect(dspaceApi.getBitstreamsFromBundle).not.toHaveBeenCalled();
    });

    /**
     * Verifica el fallback: sin portada curada (item sin thumbnail), la portada
     * cae a la primera imagen del ORIGINAL.
     */
    it('should fall back to an ORIGINAL image when the item has no thumbnail', () => {
      const itemNoCover = { ...MOCK_ITEM_DOC };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (itemNoCover as any).thumbnail;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(itemNoCover as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(MOCK_BUNDLES_IMAGE as any));

      component.ngOnInit();

      expect(component.documentCoverImage()).toBe('/server/api/core/bitstreams/orig-img-001/content');
    });

    /**
     * Verifica que el primer label del breadcrumb sea la sigla del programa (`dc.title.alternative`), no `dc.subject`.
     * `dc.subject` quedó reservado para tags libres del item desde el refactor del Sprint 6 C19.
     */
    it('should label the breadcrumb with dc.title.alternative not dc.subject', () => {
      component.ngOnInit();

      expect(breadcrumbService.setTrail).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'PEAC' }),
        ]),
      );
    });

    /** Verifica que se construyan URLs de descarga y se mapeen a BitstreamView desde el ORIGINAL embebido. */
    it('should build download URL and map bitstreams to BitstreamView', () => {
      component.ngOnInit();

      expect(component.documentBitstreams().length).toBe(1);
      expect(component.documentBitstreams()[0].url).toBe('/server/api/core/bitstreams/orig-bs-001/content');
      expect(component.documentBitstreams()[0].name).toBe('guia-peac.pdf');
      expect(component.documentBitstreams()[0].format).toBe('application/pdf');
      expect(component.documentBitstreams()[0].size).toBe(245000);
    });
  });

  /** Tipo video */

  describe('video type', () => {
    /** Verifica la detección de items de video por dc.type Video. */
    it('should detect video item by dc.type Video', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(MOCK_ITEM_VIDEO as any));

      component.ngOnInit();

      expect(component.isVideo()).toBe(true);
      expect(component.videoUrl()).toBe('https://youtube.com/watch?v=abc123');
    });
  });

  /** Múltiples bitstreams visibles en el detalle con su label de formato. */
  describe('multi-bitstream listing', () => {
    /** Verifica que todos los bitstreams del bundle ORIGINAL queden expuestos con formatLabel poblado. */
    it('should expose every bitstream from the ORIGINAL bundle with its formatLabel populated', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(MOCK_BUNDLES_MULTI as any));

      component.ngOnInit();

      // Ambos bitstreams quedan en la lista (no se filtra por extension a nivel componente).
      expect(component.documentBitstreams().length).toBe(2);
      const pdf = component.documentBitstreams().find((b) => b.name === 'guia-peac.pdf');
      const docx = component.documentBitstreams().find((b) => b.name === 'anexo.docx');
      expect(pdf?.formatLabel).toBe('PDF');
      expect(docx?.formatLabel).toBe('Word');
      expect(docx?.format).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    /** Verifica que el template renderice una fila por bitstream con su nombre y formatLabel visibles. */
    it('should render every bitstream in the template with name and formatLabel, regardless of mime', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(MOCK_BUNDLES_MULTI as any));

      const fixture = TestBed.createComponent(DocumentDetail);
      fixture.componentInstance.ngOnInit();
      fixture.detectChanges();

      // Cada bitstream lleva un nodo con [data-testid="bitstream-row"].
      const rows = fixture.nativeElement.querySelectorAll(
        '[data-testid="bitstream-row"]',
      );
      expect(rows.length).toBe(2);
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('guia-peac.pdf');
      expect(text).toContain('anexo.docx');
      expect(text).toContain('PDF');
      expect(text).toContain('Word');
    });

    /** Verifica que el botón "Descargar todo" se oculte cuando hay un único bitstream. */
    it('should hide the "Descargar todo" button when there is only one bitstream', () => {
      // El default mock (MOCK_BUNDLES) tiene exactamente un bitstream en el ORIGINAL.
      const fixture = TestBed.createComponent(DocumentDetail);
      fixture.componentInstance.ngOnInit();
      fixture.detectChanges();

      const zipBtn = fixture.nativeElement.querySelector(
        '[data-testid="download-all-zip"]',
      );
      expect(zipBtn).toBeNull();
    });

    /** Verifica que downloadAllAsZip baje todos los bitstreams, los empaque en ZIP y dispare una sola descarga. */
    it('should fetch every bitstream, bundle them into a ZIP and trigger a single download', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(MOCK_BUNDLES_MULTI as any));

      // Mock fetch para no pegar a la red; cada bitstream devuelve un blob fake.
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(['x'], { type: 'application/octet-stream' })),
        }),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = fetchMock;

      // jsdom no implementa estos metodos; los asignamos directo en el objeto.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:mock-zip');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (URL as any).revokeObjectURL = vi.fn();

      // Spy del <a download> sin romper otros createElement del fixture.
      const fakeAnchor = { click: vi.fn(), href: '', download: '' };
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return fakeAnchor as unknown as HTMLAnchorElement;
        return realCreate(tag);
      });

      component.ngOnInit();
      await component.downloadAllAsZip();

      expect(fetchMock).toHaveBeenCalledWith('/server/api/core/bitstreams/orig-bs-001/content');
      expect(fetchMock).toHaveBeenCalledWith('/server/api/core/bitstreams/orig-bs-002/content');
      expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
      expect(fakeAnchor.download).toMatch(/\.zip$/);
      // El flag de loading queda en false al cerrar el flujo (try/finally).
      expect(component.downloadingZip()).toBe(false);
    });

    /** Verifica que el botón "Descargar todo" aparezca cuando hay dos o más bitstreams. */
    it('should show the "Descargar todo" button when there are two or more bitstreams', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(MOCK_BUNDLES_MULTI as any));

      const fixture = TestBed.createComponent(DocumentDetail);
      fixture.componentInstance.ngOnInit();
      fixture.detectChanges();

      const zipBtn = fixture.nativeElement.querySelector(
        '[data-testid="download-all-zip"]',
      );
      expect(zipBtn).not.toBeNull();
    });
  });

  /** Documentos con más archivos de los que entran en una página embebida. */
  describe('large file listing', () => {
    /**
     * Verifica que con más de una página de archivos (totalElements > embebido)
     * el detalle agote el bundle ORIGINAL con paginateAll$ y los muestre todos,
     * no solo los primeros 20 que trae el embed.
     */
    it('should load every file when the ORIGINAL bundle spans more than one page', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstPage = Array.from({ length: 20 }, (_, i) => ({ uuid: `orig-${i}`, name: `archivo-${i}.pdf`, sizeBytes: 1000, _links: {} })) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const secondPage = Array.from({ length: 5 }, (_, i) => ({ uuid: `orig-2${i}`, name: `extra-${i}.pdf`, sizeBytes: 1000, _links: {} })) as any;

      // El embed trae la primera página (20) y el total real (25).
      const bundlesMany = {
        _embedded: {
          bundles: [
            {
              uuid: 'orig-bundle-001',
              name: 'ORIGINAL',
              handle: '',
              type: 'bundle',
              _links: {},
              _embedded: {
                bitstreams: {
                  _embedded: { bitstreams: firstPage },
                  page: { size: 20, totalElements: 25, totalPages: 2, number: 0 },
                },
              },
            },
          ],
        },
        _links: {},
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(bundlesMany as any));

      // paginateAll$ agota el bundle: página 0 (20) + página 1 (5) = 25.
      const page0 = { _embedded: { bitstreams: firstPage }, _links: {}, page: { size: 20, totalElements: 25, totalPages: 2, number: 0 } };
      const page1 = { _embedded: { bitstreams: secondPage }, _links: {}, page: { size: 20, totalElements: 25, totalPages: 2, number: 1 } };
      vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_uuid: string, page = 0) => of((page === 0 ? page0 : page1) as any),
      );

      component.ngOnInit();

      expect(component.documentBitstreams().length).toBe(25);
    });
  });

  /** Vocabularios: idioma, nivel educativo y tipo de documento */

  describe('vocabulary lookups', () => {
    /** Verifica que el label de idioma se resuelva via VocabularyDisplayService para códigos fuera del mapa local. */
    it('should resolve language label via VocabularyDisplayService for codes outside the hardcoded map', () => {
      const itemAchi = {
        ...MOCK_ITEM_DOC,
        metadata: {
          ...MOCK_ITEM_DOC.metadata,
          'dc.language.iso': [{ value: 'acr' }],
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(itemAchi as any));

      component.ngOnInit();

      expect(vocabDisplay.display$).toHaveBeenCalledWith('idiomas-digeex', 'acr');
      const idiomaField = component.metadataFields().find((f) => f.label === 'Idioma');
      expect(idiomaField?.value).toBe('Achi');
    });

    /**
     * Verifica que el nivel educativo NO pida vocabulario: ya llega legible
     * desde DSpace, así que se usa el valor crudo sin un fetch no-op.
     */
    it('should not translate audience via vocabulary (already readable)', () => {
      component.ngOnInit();

      expect(vocabDisplay.display$).not.toHaveBeenCalledWith('niveles-educativos', expect.anything());
      const audienceField = component.metadataFields().find((f) => f.label === 'Nivel educativo');
      expect(audienceField?.value).toBe('Primaria');
    });

    /**
     * Verifica que el tipo de documento NO pida vocabulario: ya llega legible
     * desde DSpace, así que se usa el valor crudo sin un fetch no-op.
     */
    it('should not translate type via vocabulary (already readable)', () => {
      component.ngOnInit();

      expect(vocabDisplay.display$).not.toHaveBeenCalledWith('tipos-documento', expect.anything());
      const typeField = component.metadataFields().find((f) => f.label === 'Tipo de documento');
      expect(typeField?.value).toBe('Guía');
    });
  });

  /** Estados: loading y error */

  describe('states', () => {
    /** Verifica que isLoading sea false después de completar la carga. */
    it('should set isLoading to false after load completes', () => {
      component.ngOnInit();

      expect(component.isLoading()).toBe(false);
    });

    /** Verifica el manejo graceful de errores del API. */
    it('should handle API error gracefully', () => {
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(throwError(() => new Error('404 Not Found')));

      component.ngOnInit();

      expect(component.documentTitle()).toBe('Error');
      expect(component.documentDescription()).toBe('No se pudo cargar el documento');
      expect(component.isLoading()).toBe(false);
    });
  });

  describe('video metadata cleanup', () => {
    /** Verifica que el detalle omita "Nivel educativo" para items con dc.type=Video. */
    it('should NOT include "Nivel educativo" in metadataFields when the item is Video', () => {
      const VIDEO_WITH_AUDIENCE = {
        ...MOCK_ITEM_VIDEO,
        metadata: {
          ...MOCK_ITEM_VIDEO.metadata,
          'dcterms.educationLevel': [{ value: 'Primaria' }],
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(VIDEO_WITH_AUDIENCE as any));

      component.ngOnInit();

      const labels = component.metadataFields().map((f) => f.label);
      expect(labels).not.toContain('Nivel educativo');
    });
  });

  describe('issued date rendering', () => {
    /** Verifica que un ISO date-only completo se renderice con el día local. */
    it('should render dc.date.issued preserving the local day when the value is a full ISO date', () => {
      const ITEM_FULL_DATE = {
        ...MOCK_ITEM_DOC,
        metadata: {
          ...MOCK_ITEM_DOC.metadata,
          'dc.date.issued': [{ value: '2026-05-04' }],
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(ITEM_FULL_DATE as any));

      component.ngOnInit();

      const dateField = component.metadataFields().find((f) => f.label === 'Fecha de publicación');
      expect(dateField?.value).toBe('04/05/2026');
    });
  });

  /** Visor de PDF con overlay de carga */

  describe('viewBitstream', () => {
    let loading: LoadingService;

    const PDF_BITSTREAM = {
      name: 'guia-peac.pdf',
      url: '/server/api/core/bitstreams/orig-bs-001/content',
      size: 4,
      format: 'application/pdf',
      formatLabel: 'PDF',
      uuid: 'orig-bs-001',
    };

    const DOC_BITSTREAM = {
      name: 'anexo.docx',
      url: '/server/api/core/bitstreams/orig-bs-002/content',
      size: 2,
      format: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      formatLabel: 'Word',
      uuid: 'orig-bs-002',
    };

    beforeEach(() => {
      loading = TestBed.inject(LoadingService);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:mock-pdf');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (URL as any).revokeObjectURL = vi.fn();
      vi.spyOn(window, 'open').mockReturnValue({} as Window);
    });

    /** Verifica que un PDF se abra en pestaña nueva vía blob URL. */
    it('should open a PDF in a new tab via a blob URL', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['x'], { type: 'application/pdf' })),
      });

      await component.viewBitstream(PDF_BITSTREAM);

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(window.open).toHaveBeenCalledWith('blob:mock-pdf', '_blank');
    });

    /** Verifica que el overlay de carga se abra y se cierre alrededor de la descarga. */
    it('should begin and end the loading task around the download', async () => {
      const beginSpy = vi.spyOn(loading, 'begin');
      const endSpy = vi.spyOn(loading, 'end');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['x'], { type: 'application/pdf' })),
      });

      await component.viewBitstream(PDF_BITSTREAM);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(endSpy).toHaveBeenCalledTimes(1);
    });

    /** Verifica que ante un fetch fallido se abra la URL cruda y se cierre la carga. */
    it('should fall back to the raw URL and end loading when the fetch fails', async () => {
      const endSpy = vi.spyOn(loading, 'end');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('network'));

      await component.viewBitstream(PDF_BITSTREAM);

      expect(window.open).toHaveBeenCalledWith(PDF_BITSTREAM.url, '_blank');
      expect(endSpy).toHaveBeenCalledTimes(1);
    });

    /** Verifica que un no-PDF se descargue directo sin abrir el visor. */
    it('should download non-PDF bitstreams without opening the viewer', async () => {
      const downloadSpy = vi.spyOn(component, 'downloadBitstream').mockImplementation(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchMock = ((globalThis as any).fetch = vi.fn());

      await component.viewBitstream(DOC_BITSTREAM);

      expect(downloadSpy).toHaveBeenCalledWith(DOC_BITSTREAM);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.open).not.toHaveBeenCalled();
    });
  });
});
