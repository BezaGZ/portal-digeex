import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';
import { CollectionFacade } from './collection-facade';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { CollectionCreateBody } from '../../../../core/api/models/collection.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';

type CollectionApiMock = {
  create: Mock;
  createSubmittersGroup: Mock;
  createAdminGroup: Mock;
  updateMetadata: Mock;
  delete: Mock;
};
type GroupApiMock = {
  getByName: Mock;
  addSubgroup: Mock;
  delete: Mock;
};
type ScopeMock = { assertWithinScope: Mock };
type AuthCallerMock = { currentCaller$: ReturnType<typeof of> };

/**
 * Tests de CollectionFacade.
 *
 * El facade orquesta create/update/delete de colecciones bajo una
 * subdirección. Cada método valida scope antes de tocar HTTP, ejecuta el
 * pipeline transaccional y deshace lo creado en cascada inversa cuando un
 * paso intermedio falla. El SUBMITTERS_<sufijo> es por subdirección y
 * compartido entre sus colecciones, así que el facade lo busca por nombre
 * y solo lo enlaza como subgrupo del submittersGroup técnico de la nueva
 * colección, nunca lo crea ni lo borra.
 *
 * Ciclo 13 TDD — Sprint 6
 */
describe('CollectionFacade', () => {
  let facade: CollectionFacade;
  let mockCollectionApi: CollectionApiMock;
  let mockGroupApi: GroupApiMock;
  let mockScope: ScopeMock;
  let mockAuthCaller: AuthCallerMock;

  const newCollection = {
    uuid: 'coll-new',
    name: 'Documentos PEAC',
    handle: '123456789/300',
    type: 'collection',
    metadata: {},
    archivedItemsCount: 0,
    _links: {},
  };

  const techSubmittersGroup = {
    uuid: 'tech-subm-uuid',
    name: 'COLLECTION_coll-new_SUBMIT',
    permanent: false,
    type: 'group',
    _links: {},
  };

  const techAdminGroup = {
    uuid: 'tech-admin-uuid',
    name: 'COLLECTION_coll-new_admin',
    permanent: false,
    type: 'group',
    _links: {},
  };

  const sharedSubmitters = {
    uuid: 'shared-subm-uuid',
    name: 'SUBMITTERS_ED_BASICA',
    permanent: false,
    type: 'group',
    _links: {},
  };

  const sampleBody: CollectionCreateBody = {
    name: 'Documentos PEAC',
    metadata: {
      'dc.title': [
        { value: 'Documentos PEAC', language: null, authority: null, confidence: -1, place: 0 },
      ],
    },
    type: 'collection',
  };

  function setupFacadeWithCaller(role: string, sufijo: string | null) {
    mockAuthCaller = {
      currentCaller$: of({ role, sufijo }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        CollectionFacade,
        { provide: CollectionApiService, useValue: mockCollectionApi },
        { provide: GroupApiService, useValue: mockGroupApi },
        { provide: ContentScopeService, useValue: mockScope },
        { provide: AuthCallerService, useValue: mockAuthCaller },
      ],
    });
    facade = TestBed.inject(CollectionFacade);
  }

  beforeEach(() => {
    mockCollectionApi = {
      create: vi.fn(() => of(newCollection)),
      createSubmittersGroup: vi.fn(() => of(techSubmittersGroup)),
      createAdminGroup: vi.fn(() => of(techAdminGroup)),
      updateMetadata: vi.fn(() => of({ ...newCollection, name: 'Renombrada' })),
      delete: vi.fn(() => of(undefined)),
    };
    mockGroupApi = {
      getByName: vi.fn(() => of(sharedSubmitters)),
      addSubgroup: vi.fn(() => of(undefined)),
      delete: vi.fn(() => of(undefined)),
    };
    mockScope = {
      assertWithinScope: vi.fn(),
    };
  });

  describe('createColeccion$', () => {
    it('should validate scope, then chain 4 HTTP calls in order, returning the new collection', async () => {
      setupFacadeWithCaller('superadmin', null);

      const result = await firstValueFrom(
        facade.createColeccion$('parent-comm-uuid', sampleBody, 'ED_BASICA'),
      );

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'collection',
        resourceSufijo: 'ED_BASICA',
        caller: { role: 'superadmin', sufijo: null },
      });
      expect(mockCollectionApi.create).toHaveBeenCalledWith('parent-comm-uuid', sampleBody);
      expect(mockCollectionApi.createSubmittersGroup).toHaveBeenCalledWith('coll-new', expect.any(Object));
      expect(mockGroupApi.getByName).toHaveBeenCalledWith('SUBMITTERS_ED_BASICA');
      expect(mockGroupApi.addSubgroup).toHaveBeenCalledWith(
        'tech-subm-uuid',
        expect.stringContaining('shared-subm-uuid'),
      );
      expect(result).toEqual(newCollection);
    });

    it('should throw OUT_OF_SCOPE without making HTTP calls when caller sufijo does not match', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_TRABAJO');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody, 'ED_BASICA')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCollectionApi.create).not.toHaveBeenCalled();
      expect(mockCollectionApi.createSubmittersGroup).not.toHaveBeenCalled();
    });

    /**
     * Ciclo 40.3 — extiende el pipeline con el enlace al adminGroup técnico
     * para mantener simetría con el seed. Después de enlazar SUBMITTERS al
     * `_SUBMIT` técnico, el facade crea el `_admin` técnico y enlaza el mismo
     * SUBMITTERS shared como subgroup, reusando el `getByName` previo (sin
     * pegarlo dos veces a DSpace).
     */
    it('should also create the adminGroup and link SUBMITTERS, reusing the getByName result (single lookup)', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(
        facade.createColeccion$('parent-comm-uuid', sampleBody, 'ED_BASICA'),
      );

      expect(mockCollectionApi.createAdminGroup).toHaveBeenCalledWith('coll-new', expect.any(Object));
      expect(mockGroupApi.addSubgroup).toHaveBeenCalledWith(
        'tech-admin-uuid',
        expect.stringContaining('shared-subm-uuid'),
      );
      expect(mockGroupApi.getByName).toHaveBeenCalledTimes(1);
      expect(mockGroupApi.addSubgroup).toHaveBeenCalledTimes(2);
    });

    it('should rollback the created collection when SUBMITTERS lookup fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockGroupApi.getByName = vi.fn(() =>
        throwError(() => new Error('No matching exact group')),
      );

      await expect(
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody, 'ED_BASICA')),
      ).rejects.toThrow();
      expect(mockCollectionApi.delete).toHaveBeenCalledWith('coll-new');
    });

    /**
     * Ciclo 40.3 — si falla la creación del adminGroup técnico, el cleanup
     * debe deshacer el submittersGroup técnico ya creado y la collection. No
     * intenta borrar un techAdmin que no existe.
     */
    it('should rollback techSubmit and collection when createAdminGroup fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockCollectionApi.createAdminGroup = vi.fn(() =>
        throwError(() => new Error('500 creating adminGroup')),
      );

      await expect(
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody, 'ED_BASICA')),
      ).rejects.toThrow();
      expect(mockGroupApi.delete).toHaveBeenCalledWith('tech-subm-uuid');
      expect(mockGroupApi.delete).not.toHaveBeenCalledWith('tech-admin-uuid');
      expect(mockCollectionApi.delete).toHaveBeenCalledWith('coll-new');
    });

    /**
     * Ciclo 40.3 — si el segundo addSubgroup (el de SUBMITTERS al admin
     * técnico) falla, el cleanup debe deshacer en cascada inversa: admin
     * técnico, submit técnico y collection. Es el escenario que más residuos
     * podría dejar.
     */
    it('should rollback techAdmin, techSubmit and collection when admin addSubgroup fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      let addSubgroupCalls = 0;
      mockGroupApi.addSubgroup = vi.fn(() => {
        addSubgroupCalls += 1;
        if (addSubgroupCalls === 2) {
          return throwError(() => new Error('500 linking SUBMITTERS to admin'));
        }
        return of(undefined);
      });

      await expect(
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody, 'ED_BASICA')),
      ).rejects.toThrow();
      expect(mockGroupApi.delete).toHaveBeenCalledWith('tech-admin-uuid');
      expect(mockGroupApi.delete).toHaveBeenCalledWith('tech-subm-uuid');
      expect(mockCollectionApi.delete).toHaveBeenCalledWith('coll-new');
    });
  });

  describe('updateColeccion$', () => {
    it('should validate scope and PATCH the collection when superadmin', async () => {
      setupFacadeWithCaller('superadmin', null);
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'Renombrada' },
      ];

      const result = await firstValueFrom(facade.updateColeccion$('coll-1', patch, 'ED_BASICA'));

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'collection',
        resourceSufijo: 'ED_BASICA',
        caller: { role: 'superadmin', sufijo: null },
      });
      expect(mockCollectionApi.updateMetadata).toHaveBeenCalledWith('coll-1', patch);
      expect(result.name).toBe('Renombrada');
    });

    it('should throw OUT_OF_SCOPE without PATCH when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'X' },
      ];

      await expect(
        firstValueFrom(facade.updateColeccion$('coll-1', patch, 'ED_TRABAJO')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCollectionApi.updateMetadata).not.toHaveBeenCalled();
    });
  });

  describe('deleteColeccion$', () => {
    it('should delete only the collection without touching the shared SUBMITTERS group', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.deleteColeccion$('coll-1', 'ED_BASICA'));

      expect(mockScope.assertWithinScope).toHaveBeenCalled();
      expect(mockCollectionApi.delete).toHaveBeenCalledWith('coll-1');
      expect(mockGroupApi.delete).not.toHaveBeenCalled();
      expect(mockGroupApi.getByName).not.toHaveBeenCalled();
    });

    it('should throw OUT_OF_SCOPE without DELETE when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(
        firstValueFrom(facade.deleteColeccion$('coll-1', 'ED_TRABAJO')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCollectionApi.delete).not.toHaveBeenCalled();
    });
  });
});
