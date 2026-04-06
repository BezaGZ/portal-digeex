import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DocumentDetailComponent } from './document-detail.component';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';

/**
 * Tests para DocumentDetailComponent.
 *
 * Vista detalle de recurso: carga metadata completa de un item
 * DSpace por UUID, muestra thumbnail, bitstreams descargables,
 * y soporta documentos PDF y videos (MovingImage).
 *
 * Ciclo 4 TDD — Sprint 4 (RED).
 *
 */
describe('DocumentDetailComponent', () => {
  let component: DocumentDetailComponent;
  let dspaceApi: DSpaceApiService;
  let breadcrumbService: BreadcrumbService;

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
    breadcrumbService = TestBed.inject(BreadcrumbService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should extract docId from route params and call getItem', () => {
    component.ngOnInit();

    expect(component.documentId).toBe('item-doc-001');
    expect(component.programId).toBe('program-001');
  });

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

  it('should load THUMBNAIL and ORIGINAL bundles via forkJoin', () => {
    component.ngOnInit();

    expect(component.documentCoverImage).toBe('/server/api/core/bitstreams/thumb-bs-001/content');
  });

  it('should build download URL and map bitstreams to BitstreamView', () => {
    component.ngOnInit();

    expect(component.documentBitstreams.length).toBe(1);
    expect(component.documentBitstreams[0].url).toBe('/server/api/core/bitstreams/orig-bs-001/content');
    expect(component.documentBitstreams[0].name).toBe('guia-peac.pdf');
    expect(component.documentBitstreams[0].format).toBe('application/pdf');
    expect(component.documentBitstreams[0].size).toBe(245000);
  });

  it('should detect video item by dc.type MovingImage', () => {
    component.ngOnInit();

    expect(component.isVideo).toBe(true);
    expect(component.videoUrl).toBe('https://youtube.com/watch?v=abc123');
  });

  it('should set isLoading to false after load completes', () => {
    component.ngOnInit();

    expect(component.isLoading).toBe(false);
  });

  it('should handle API error gracefully', () => {
    component.ngOnInit();

    expect(component.documentTitle).toBe('Error');
    expect(component.documentDescription).toBe('No se pudo cargar el documento');
    expect(component.isLoading).toBe(false);
  });
});