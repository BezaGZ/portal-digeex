import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { SubmissionPage } from './submission-page';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Collection } from '../../../../core/api/models/collection.model';

/**
 * SubmissionPage es el destino de la ruta `/administrador/programas/:uuid/cargar`.
 * Lee el UUID del paramMap, pega getOne al CollectionApiService y expone
 * la colección como signal para que el template monte el SubmissionFormHost
 * con esa colección y el caller del AuthCallerService.
 *
 * Ciclo 26 TDD — Sprint 6
 */
describe('SubmissionPage', () => {
  function buildCollection(uuid: string): Collection {
    return {
      uuid,
      name: 'PEAC',
      handle: '123/1',
      archivedItemsCount: 0,
      type: 'collection',
      metadata: {
        'dspace.entity.type': [
          { value: 'Documento', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };
  }

  it('should call CollectionApiService.getOne with the uuid from the route paramMap', () => {
    const getOneFn = vi.fn().mockReturnValue(of(buildCollection('peac-uuid')));
    TestBed.configureTestingModule({
      imports: [SubmissionPage],
      providers: [
        provideNoopAnimations(),
        { provide: CollectionApiService, useValue: { getOne: getOneFn } },
        {
          provide: AuthCallerService,
          useValue: { currentCaller$: of({ role: 'superadmin', sufijo: null }) },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of({ get: (k: string) => (k === 'uuid' ? 'peac-uuid' : null) }) },
        },
      ],
    });

    const fixture = TestBed.createComponent(SubmissionPage);
    fixture.detectChanges();

    expect(getOneFn).toHaveBeenCalledWith('peac-uuid');
    expect(fixture.componentInstance.collection()?.uuid).toBe('peac-uuid');
  });
});
