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

/**
 * Tests para DocumentDetailComponent.
 *
 * Vista detalle de recurso: carga metadata completa de un item
 * DSpace por UUID, muestra thumbnail, bitstreams descargables,
 * y soporta documentos PDF y videos (MovingImage).
 *
 * Ciclo 4 TDD — Sprint 4
 */

describe('DocumentDetailComponent', () => {
  let component: DocumentDetailComponent;
  let dspaceApi: DSpaceApiService;
  let collectionApi: CollectionApiService;
  let breadcrumbService: BreadcrumbService;

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
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /** Carga de item y metadata */

  describe('carga de item', () => {
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

  describe('bundles y bitstreams', () => {
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

  describe('tipo video', () => {
    /** Verifica la detección de items de video por dc.type Video. */
    it('should detect video item by dc.type Video', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(dspaceApi, 'getItem').mockReturnValue(of(MOCK_ITEM_VIDEO as any));

      component.ngOnInit();

      expect(component.isVideo).toBe(true);
      expect(component.videoUrl).toBe('https://youtube.com/watch?v=abc123');
    });
  });

  /** Estados: loading y error */

  describe('estados', () => {
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
});
