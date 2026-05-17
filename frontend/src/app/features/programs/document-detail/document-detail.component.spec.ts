import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { DocumentDetailComponent } from './document-detail.component';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { VocabularyDisplayService } from '../../../core/api/vocabulary-display.service';

/**
 * Tests para DocumentDetailComponent.
 *
 * Vista detalle de recurso: carga metadata completa de un item
 * DSpace por UUID, muestra thumbnail, bitstreams descargables,
 * y soporta documentos PDF y videos (MovingImage).
 *
 * Ciclo 4 TDD — Sprint 4. Ajustado en Ciclo 36 — Sprint 6.
 */

describe('DocumentDetailComponent', () => {
  let component: DocumentDetailComponent;
  let dspaceApi: DSpaceApiService;
  let collectionApi: CollectionApiService;
  let breadcrumbService: BreadcrumbService;
  let vocabDisplay: VocabularyDisplayService;

  /** Fixtures */

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
      'dc.audience': [{ value: 'Primaria' }],
      'dc.subject': [{ value: 'Educación' }, { value: 'PEAC' }],
      'dc.language.iso': [{ value: 'es' }],
      'dc.publisher': [{ value: 'MINEDUC' }],
    },
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

  const MOCK_BUNDLES = {
    _embedded: {
      bundles: [
        { uuid: 'thumb-bundle-001', name: 'THUMBNAIL', handle: '', type: 'bundle', _links: {} },
        { uuid: 'orig-bundle-001', name: 'ORIGINAL', handle: '', type: 'bundle', _links: {} },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
  };

  const MOCK_THUMBNAIL_BITSTREAMS = {
    _embedded: {
      bitstreams: [
        { uuid: 'thumb-bs-001', name: 'guia-peac.jpg.jpg', sizeBytes: 5000, _links: {} },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
  };

  const MOCK_ORIGINAL_BITSTREAMS = {
    _embedded: {
      bitstreams: [
        { uuid: 'orig-bs-001', name: 'guia-peac.pdf', sizeBytes: 245000, _links: {} },
      ],
    },
    _links: {},
    page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
  };

  /** Setup */

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { params: of({ docId: 'item-doc-001', id: 'program-001' }) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DocumentDetailComponent);
    component = fixture.componentInstance;
    dspaceApi = TestBed.inject(DSpaceApiService);
    collectionApi = TestBed.inject(CollectionApiService);
    breadcrumbService = TestBed.inject(BreadcrumbService);
    vocabDisplay = TestBed.inject(VocabularyDisplayService);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(MOCK_ITEM_DOC as any));
    vi.spyOn(dspaceApi, 'getBundles').mockReturnValue(of(MOCK_BUNDLES as any));
    vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation((bundleUuid: string) => {
      if (bundleUuid === 'thumb-bundle-001') return of(MOCK_THUMBNAIL_BITSTREAMS as any);
      if (bundleUuid === 'orig-bundle-001') return of(MOCK_ORIGINAL_BITSTREAMS as any);
      return of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any);
    });
    vi.spyOn(collectionApi, 'getOne').mockReturnValue(of({ name: 'PEAC', metadata: { 'dc.subject': [{ value: 'PEAC' }] } } as any));
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
    /** Verifica que extraiga docId de la ruta y llame a getItem. */
    it('should extract docId from route params and call getItem', () => {
      component.ngOnInit();

      expect(component.documentId).toBe('item-doc-001');
      expect(component.programId).toBe('program-001');
      expect(dspaceApi.getItem).toHaveBeenCalledWith('item-doc-001');
    });

    /** Verifica que los campos de metadata se mapeen correctamente al UI. */
    it('should display metadata fields from item response', () => {
      component.ngOnInit();

      expect(component.documentTitle).toBe('Guía Curricular PEAC');
      expect(component.documentDescription).toBe('Guía para el programa PEAC de educación.');

      const labels = component.metadataFields.map((f) => f.label);
      expect(labels).toContain('Autor / Área responsable');
      expect(labels).toContain('Fecha de publicación');
      expect(labels).toContain('Tipo de documento');
      expect(labels).toContain('Nivel educativo');
      expect(labels).toContain('Palabras clave');
      expect(labels).toContain('Idioma');
      expect(labels).toContain('Publicado por');

      const autorField = component.metadataFields.find((f) => f.label === 'Autor / Área responsable');
      expect(autorField?.value).toBe('DIGEEX');
      expect(autorField?.type).toBe('text');

      const keywordsField = component.metadataFields.find((f) => f.label === 'Palabras clave');
      expect(keywordsField?.value).toEqual(['Educación', 'PEAC']);
      expect(keywordsField?.type).toBe('list');

      const idiomaField = component.metadataFields.find((f) => f.label === 'Idioma');
      expect(idiomaField?.value).toBe('Español');
    });
  });

  /** Bundles y bitstreams */

  describe('bundles and bitstreams', () => {
    /** Verifica la carga de bundles THUMBNAIL y ORIGINAL mediante forkJoin. */
    it('should load THUMBNAIL and ORIGINAL bundles via forkJoin', () => {
      component.ngOnInit();

      expect(dspaceApi.getBundles).toHaveBeenCalledWith('item-doc-001');
      expect(dspaceApi.getBitstreamsFromBundle).toHaveBeenCalledWith('thumb-bundle-001');
      expect(dspaceApi.getBitstreamsFromBundle).toHaveBeenCalledWith('orig-bundle-001');
      expect(component.documentCoverImage).toBe('/server/api/core/bitstreams/thumb-bs-001/content');
    });

    /** Verifica que se construyan URLs de descarga y se mapeen a BitstreamView. */
    it('should build download URL and map bitstreams to BitstreamView', () => {
      component.ngOnInit();

      expect(component.documentBitstreams.length).toBe(1);
      expect(component.documentBitstreams[0].url).toBe('/server/api/core/bitstreams/orig-bs-001/content');
      expect(component.documentBitstreams[0].name).toBe('guia-peac.pdf');
      expect(component.documentBitstreams[0].format).toBe('application/pdf');
      expect(component.documentBitstreams[0].size).toBe(245000);
    });
  });

  /** Tipo video */

  describe('video type', () => {
    /** Verifica la detección de items de video por dc.type Video. */
    it('should detect video item by dc.type Video', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(MOCK_ITEM_VIDEO as any));

      component.ngOnInit();

      expect(component.isVideo).toBe(true);
      expect(component.videoUrl).toBe('https://youtube.com/watch?v=abc123');
    });
  });

  /** Múltiples bitstreams visibles en el detalle con su label de formato. */
  describe('multi-bitstream listing', () => {
    // Mock con PDF + Word para cubrir caso real de varios archivos por item.
    const MOCK_MULTI_ORIGINAL = {
      _embedded: {
        bitstreams: [
          { uuid: 'orig-bs-001', name: 'guia-peac.pdf', sizeBytes: 245000, _links: {} },
          { uuid: 'orig-bs-002', name: 'anexo.docx', sizeBytes: 50000, _links: {} },
        ],
      },
      _links: {},
      page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
    };

    /** Verifica que todos los bitstreams del bundle ORIGINAL queden expuestos con formatLabel poblado. */
    it('should expose every bitstream from the ORIGINAL bundle with its formatLabel populated', () => {
      vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation((bundleUuid: string) => {
        if (bundleUuid === 'thumb-bundle-001') return of(MOCK_THUMBNAIL_BITSTREAMS as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (bundleUuid === 'orig-bundle-001') return of(MOCK_MULTI_ORIGINAL as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        return of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      component.ngOnInit();

      // Ambos bitstreams quedan en la lista (no se filtra por extension a nivel componente).
      expect(component.documentBitstreams.length).toBe(2);
      const pdf = component.documentBitstreams.find((b) => b.name === 'guia-peac.pdf');
      const docx = component.documentBitstreams.find((b) => b.name === 'anexo.docx');
      expect(pdf?.formatLabel).toBe('PDF');
      expect(docx?.formatLabel).toBe('Word');
      expect(docx?.format).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    /** Verifica que el template renderice una fila por bitstream con su nombre y formatLabel visibles. */
    it('should render every bitstream in the template with name and formatLabel, regardless of mime', () => {
      vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation((bundleUuid: string) => {
        if (bundleUuid === 'thumb-bundle-001') return of(MOCK_THUMBNAIL_BITSTREAMS as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (bundleUuid === 'orig-bundle-001') return of(MOCK_MULTI_ORIGINAL as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        return of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      const fixture = TestBed.createComponent(DocumentDetailComponent);
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
      // El default mock (MOCK_ORIGINAL_BITSTREAMS) tiene exactamente un bitstream.
      const fixture = TestBed.createComponent(DocumentDetailComponent);
      fixture.componentInstance.ngOnInit();
      fixture.detectChanges();

      const zipBtn = fixture.nativeElement.querySelector(
        '[data-testid="download-all-zip"]',
      );
      expect(zipBtn).toBeNull();
    });

    /** Verifica que downloadAllAsZip baje todos los bitstreams, los empaque en ZIP y dispare una sola descarga. */
    it('should fetch every bitstream, bundle them into a ZIP and trigger a single download', async () => {
      vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation((bundleUuid: string) => {
        if (bundleUuid === 'thumb-bundle-001') return of(MOCK_THUMBNAIL_BITSTREAMS as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (bundleUuid === 'orig-bundle-001') return of(MOCK_MULTI_ORIGINAL as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        return of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      });

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
      expect(component.downloadingZip).toBe(false);
    });

    /** Verifica que el botón "Descargar todo" aparezca cuando hay dos o más bitstreams. */
    it('should show the "Descargar todo" button when there are two or more bitstreams', () => {
      vi.spyOn(dspaceApi, 'getBitstreamsFromBundle').mockImplementation((bundleUuid: string) => {
        if (bundleUuid === 'thumb-bundle-001') return of(MOCK_THUMBNAIL_BITSTREAMS as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (bundleUuid === 'orig-bundle-001') return of(MOCK_MULTI_ORIGINAL as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        return of({ _embedded: { bitstreams: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      const fixture = TestBed.createComponent(DocumentDetailComponent);
      fixture.componentInstance.ngOnInit();
      fixture.detectChanges();

      const zipBtn = fixture.nativeElement.querySelector(
        '[data-testid="download-all-zip"]',
      );
      expect(zipBtn).not.toBeNull();
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
      const idiomaField = component.metadataFields.find((f) => f.label === 'Idioma');
      expect(idiomaField?.value).toBe('Achi');
    });

    /** Verifica que el label de nivel educativo se resuelva via VocabularyDisplayService. */
    it('should resolve audience label via VocabularyDisplayService', () => {
      component.ngOnInit();

      expect(vocabDisplay.display$).toHaveBeenCalledWith('niveles-educativos', 'Primaria');
      const audienceField = component.metadataFields.find((f) => f.label === 'Nivel educativo');
      expect(audienceField?.value).toBe('Primaria');
    });

    /** Verifica que el label del tipo de documento se resuelva via VocabularyDisplayService (vocabulario tipos-documento). */
    it('should resolve type label via VocabularyDisplayService', () => {
      component.ngOnInit();

      expect(vocabDisplay.display$).toHaveBeenCalledWith('tipos-documento', 'Guía');
      const typeField = component.metadataFields.find((f) => f.label === 'Tipo de documento');
      expect(typeField?.value).toBe('Guía');
    });
  });

  /** Estados: loading y error */

  describe('states', () => {
    /** Verifica que isLoading sea false después de completar la carga. */
    it('should set isLoading to false after load completes', () => {
      component.ngOnInit();

      expect(component.isLoading).toBe(false);
    });

    /** Verifica el manejo graceful de errores del API. */
    it('should handle API error gracefully', () => {
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(throwError(() => new Error('404 Not Found')));

      component.ngOnInit();

      expect(component.documentTitle).toBe('Error');
      expect(component.documentDescription).toBe('No se pudo cargar el documento');
      expect(component.isLoading).toBe(false);
    });
  });

  describe('video metadata cleanup', () => {
    /** Verifica que el detalle omita "Nivel educativo" para items con dc.type=Video. */
    it('should NOT include "Nivel educativo" in metadataFields when the item is Video', () => {
      const VIDEO_WITH_AUDIENCE = {
        ...MOCK_ITEM_VIDEO,
        metadata: {
          ...MOCK_ITEM_VIDEO.metadata,
          'dc.audience': [{ value: 'Primaria' }],
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(VIDEO_WITH_AUDIENCE as any));

      component.ngOnInit();

      const labels = component.metadataFields.map((f) => f.label);
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

      const dateField = component.metadataFields.find((f) => f.label === 'Fecha de publicación');
      expect(dateField?.value).toBe('04/05/2026');
    });
  });
});
