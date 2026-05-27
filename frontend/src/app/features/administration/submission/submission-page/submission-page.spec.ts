import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { SubmissionPage } from './submission-page';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Collection } from '../../../../core/api/models/collection.model';

/**
 * SubmissionPage es el destino de la ruta `/administrador/programas/:uuid/cargar`.
 * Lee el UUID del paramMap, pega getOne al CollectionApiService y expone
 * la colección como signal para que el template monte el SubmissionFormHost
 * con esa colección y el caller del AuthCallerService. Ante un UUID ausente
 * o un getOne fallido redirige al listado de carga con un toast en vez de
 * quedar en spinner indefinido.
 *
 * Ciclo 26 TDD — Sprint 6. Ajustado en Ciclo 17 (Sprint 7).
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

  function configure(opts: {
    getOne: ReturnType<typeof vi.fn>;
    uuid: string | null;
    navigate: ReturnType<typeof vi.fn>;
    toastAdd: ReturnType<typeof vi.fn>;
  }): void {
    TestBed.configureTestingModule({
      imports: [SubmissionPage],
      providers: [
        provideNoopAnimations(),
        { provide: CollectionApiService, useValue: { getOne: opts.getOne } },
        {
          provide: AuthCallerService,
          useValue: { currentCaller$: of({ role: 'superadmin', sufijo: null }) },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of({ get: (k: string) => (k === 'uuid' ? opts.uuid : null) }) },
        },
        { provide: Router, useValue: { navigate: opts.navigate } },
        { provide: MessageService, useValue: { add: opts.toastAdd } },
      ],
    });
  }

  /** Verifica que pegue getOne con el uuid del paramMap y exponga la colección resuelta. */
  it('should call CollectionApiService.getOne with the uuid from the route paramMap', () => {
    const getOne = vi.fn().mockReturnValue(of(buildCollection('peac-uuid')));
    configure({ getOne, uuid: 'peac-uuid', navigate: vi.fn(), toastAdd: vi.fn() });

    const fixture = TestBed.createComponent(SubmissionPage);
    fixture.detectChanges();

    expect(getOne).toHaveBeenCalledWith('peac-uuid');
    expect(fixture.componentInstance.collection()?.uuid).toBe('peac-uuid');
  });

  /**
   * Verifica que ante un getOne fallido redirija al listado de carga con toast.
   * Sin la guardia, el error mata el stream y el template queda en spinner infinito.
   */
  it('should navigate to /administrador/cargar and toast when getOne fails', () => {
    const getOne = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const navigate = vi.fn();
    const toastAdd = vi.fn();
    configure({ getOne, uuid: 'uuid-inexistente', navigate, toastAdd });

    const fixture = TestBed.createComponent(SubmissionPage);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/administrador/cargar']);
    expect(toastAdd).toHaveBeenCalled();
    expect(fixture.componentInstance.collection()).toBeNull();
  });

  /** Verifica que un paramMap sin uuid redirija sin pegar getOne. */
  it('should navigate to /administrador/cargar when the route has no uuid', () => {
    const getOne = vi.fn();
    const navigate = vi.fn();
    configure({ getOne, uuid: null, navigate, toastAdd: vi.fn() });

    const fixture = TestBed.createComponent(SubmissionPage);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/administrador/cargar']);
    expect(getOne).not.toHaveBeenCalled();
  });
});
