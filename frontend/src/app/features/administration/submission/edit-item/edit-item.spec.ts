import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { EditItem } from './edit-item';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { Item } from '../../../../core/api/models/item.model';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { SubmissionFacade } from '../../content/services/submission-facade';
import { ItemAdminFacade } from '../../content/services/item-admin-facade';
import { VocabularyApiService } from '../../../../core/api/vocabulary-api.service';
import { MessageService } from 'primeng/api';

/**
 * Tests de EditItem.
 *
 * Container de la ruta /administrador/envios/:uuid/editar. Carga el item por
 * UUID con ItemApiService.getOne y, según dspace.entity.type de la metadata,
 * monta DocumentSubmissionForm, GallerySubmissionForm o StatsSubmissionForm
 * en modo edición pasándoles el item como input.
 *
 * Ciclo 32 TDD — Sprint 6.
 */
describe('EditItem', () => {
  function buildItem(entityType: string, uuid = 'item-1'): Item {
    return {
      uuid,
      name: 'X',
      handle: '123/1',
      inArchive: true,
      discoverable: true,
      withdrawn: false,
      lastModified: '2026-05-11T00:00:00Z',
      type: 'item',
      metadata: {
        'dc.title': [{ value: 'Título', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.type': [{ value: entityType === 'Galeria' ? 'Capacitación' : 'Manual', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.date.issued': [{ value: '2025-01-01', language: null, authority: null, confidence: -1, place: 0 }],
        'dspace.entity.type': [{ value: entityType, language: null, authority: null, confidence: -1, place: 0 }],
      },
    };
  }

  let getOneFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getOneFn = vi.fn().mockReturnValue(of(buildItem('Documento', 'item-1')));

    TestBed.configureTestingModule({
      imports: [EditItem],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: ItemApiService, useValue: { getOne: getOneFn } },
        { provide: AuthCallerService, useValue: { currentCaller$: of({ role: 'superadmin', sufijo: 'PEAC' }) } },
        { provide: SubmissionFacade, useValue: { submitItem$: vi.fn() } },
        { provide: ItemAdminFacade, useValue: { editItem$: vi.fn() } },
        { provide: VocabularyApiService, useValue: { getEntries: vi.fn().mockReturnValue(of([])) } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ uuid: 'item-1' })) },
        },
      ],
    });
  });

  /** Verifica que la página pida el item por el uuid del paramMap al inicializar. */
  it('should fetch the item by uuid from the route paramMap on init', () => {
    const fixture = TestBed.createComponent(EditItem);
    fixture.detectChanges();

    expect(getOneFn).toHaveBeenCalledWith('item-1');
  });

  /** Verifica que con entity-type=Documento se monte el DocumentSubmissionForm en el template. */
  it('should render the DocumentSubmissionForm when the item entity type is Documento', () => {
    const fixture = TestBed.createComponent(EditItem);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-document-submission-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-gallery-submission-form')).toBeFalsy();
  });

  /** Verifica que con entity-type=Galeria se monte el GallerySubmissionForm. */
  it('should render the GallerySubmissionForm when the item entity type is Galeria', () => {
    getOneFn.mockReturnValue(of(buildItem('Galeria', 'album-9')));

    const fixture = TestBed.createComponent(EditItem);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-gallery-submission-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-document-submission-form')).toBeFalsy();
  });
});
