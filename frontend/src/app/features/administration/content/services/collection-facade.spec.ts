import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';
import { CollectionFacade } from './collection-facade';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { BundleApiService } from '../../../../core/api/bundle-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { AuditTrailService } from '../provenance/audit-trail.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { CollectionCreateBody } from '../../../../core/api/models/collection.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';
import { Caller } from '../specifications/scope-context.model';
import { UserRole } from '../../users/models/user-view.model';

type CollectionApiMock = {
  create: Mock;
  createSubmittersGroup: Mock;
  createAdminGroup: Mock;
  updateMetadata: Mock;
  delete: Mock;
  getLogo: Mock;
  uploadLogo: Mock;
};
type GroupApiMock = {
  getByName: Mock;
  addSubgroup: Mock;
  delete: Mock;
};
type BundleApiMock = {
  deleteBitstream: Mock;
};
type ScopeMock = { assertWithinScope: Mock };
type AuthCallerMock = { currentCaller$: Observable<Caller | null> };
type AuditMock = { appendProvenance$: Mock };
type CommunityApiMock = { getOne: Mock };

/**
 * Tests de CollectionFacade.
 *
 * El facade orquesta create/update/delete de colecciones bajo una
 * subdirección. Cada método valida scope antes de tocar HTTP, ejecuta el
 * pipeline transaccional y deshace lo creado en cascada inversa cuando un
 * paso intermedio falla. El SUBMITTERS_<sufijo> es por subdirección y
 * compartido entre sus colecciones; el facade lee su uuid del metadata de
 * la community (`digeex.submittersGroup`) y solo lo enlaza como subgrupo
 * del submittersGroup técnico de la nueva colección, nunca lo crea ni lo
 * borra. Metadato ausente es error claro antes de crear (falta backfill).
 *
 * Ciclo 13 TDD — Sprint 6. Ajustado en Ciclos 3 y 21 (Sprint 8) y Ciclos 4 y 5 (Sprint 11).
 */
describe('CollectionFacade', () => {
  let facade: CollectionFacade;
  let mockCollectionApi: CollectionApiMock;
  let mockGroupApi: GroupApiMock;
  let mockBundleApi: BundleApiMock;
  let mockScope: ScopeMock;
  let mockAudit: AuditMock;
  let mockAuthCaller: AuthCallerMock;
  let mockCommunityApi: CommunityApiMock;

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

  const parentCommunity = {
    uuid: 'parent-comm-uuid',
    name: 'Subdirección de Educación Básica',
    handle: '123456789/2',
    type: 'community',
    archivedItemsCount: 0,
    metadata: {
      'digeex.submittersGroup': [
        { value: 'shared-subm-uuid', language: null, authority: null, confidence: -1, place: 0 },
      ],
    },
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

  function setupFacadeWithCaller(role: UserRole, scopeUuid: string | null) {
    mockAuthCaller = {
      currentCaller$: of({ role, scopeUuid }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        CollectionFacade,
        { provide: CollectionApiService, useValue: mockCollectionApi },
        { provide: CommunityApiService, useValue: mockCommunityApi },
        { provide: GroupApiService, useValue: mockGroupApi },
        { provide: BundleApiService, useValue: mockBundleApi },
        { provide: ContentScopeService, useValue: mockScope },
        { provide: AuthCallerService, useValue: mockAuthCaller },
        { provide: AuditTrailService, useValue: mockAudit },
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
      getLogo: vi.fn(() => of(null)),
      uploadLogo: vi.fn(() => of({ uuid: 'new-logo-bs' })),
    };
    mockGroupApi = {
      getByName: vi.fn(() => of(sharedSubmitters)),
      addSubgroup: vi.fn(() => of(undefined)),
      delete: vi.fn(() => of(undefined)),
    };
    mockBundleApi = {
      deleteBitstream: vi.fn(() => of(undefined)),
    };
    mockScope = {
      assertWithinScope: vi.fn(),
    };
    mockAudit = { appendProvenance$: vi.fn(() => of(undefined)) };
    mockCommunityApi = { getOne: vi.fn(() => of(parentCommunity)) };
  });

  describe('createColeccion$', () => {
    it('should validate scope, then chain 4 HTTP calls in order, returning the new collection', async () => {
      setupFacadeWithCaller('superadmin', null);

      const result = await firstValueFrom(
        facade.createColeccion$('parent-comm-uuid', sampleBody),
      );

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'collection',
        resourceScopeUuid: 'parent-comm-uuid',
        caller: { role: 'superadmin', scopeUuid: null },
      });
      expect(mockCommunityApi.getOne).toHaveBeenCalledWith('parent-comm-uuid');
      expect(mockCollectionApi.create).toHaveBeenCalledWith('parent-comm-uuid', sampleBody);
      expect(mockCollectionApi.createSubmittersGroup).toHaveBeenCalledWith('coll-new', expect.any(Object));
      expect(mockGroupApi.getByName).not.toHaveBeenCalled();
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
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody)),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCollectionApi.create).not.toHaveBeenCalled();
      expect(mockCollectionApi.createSubmittersGroup).not.toHaveBeenCalled();
    });

    /**
     * Verifica que el pipeline cree el `_admin` técnico y enlace el SUBMITTERS
     * shared como subgroup con una sola lectura del metadata de la community,
     * sin ningún lookup por nombre.
     */
    it('should also create the adminGroup and link SUBMITTERS from the community metadata (single read)', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(
        facade.createColeccion$('parent-comm-uuid', sampleBody),
      );

      expect(mockCollectionApi.createAdminGroup).toHaveBeenCalledWith('coll-new', expect.any(Object));
      expect(mockGroupApi.addSubgroup).toHaveBeenCalledWith(
        'tech-admin-uuid',
        expect.stringContaining('shared-subm-uuid'),
      );
      expect(mockCommunityApi.getOne).toHaveBeenCalledTimes(1);
      expect(mockGroupApi.addSubgroup).toHaveBeenCalledTimes(2);
    });

    /** Verifica el fail-fast: sin el metadato del grupo no se crea nada y el error pide el backfill. */
    it('should throw a clear error without creating anything when the community lacks the group metadata', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockCommunityApi.getOne = vi.fn(() => of({ ...parentCommunity, metadata: {} }));

      await expect(
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody)),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCollectionApi.create).not.toHaveBeenCalled();
    });

    /**
     * Verifica que si falla la creación del adminGroup técnico, el cleanup
     * deshaga el submittersGroup técnico ya creado y la collection sin intentar
     * borrar un techAdmin que no existe.
     */
    it('should rollback techSubmit and collection when createAdminGroup fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockCollectionApi.createAdminGroup = vi.fn(() =>
        throwError(() => new Error('500 creating adminGroup')),
      );

      await expect(
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody)),
      ).rejects.toThrow();
      expect(mockGroupApi.delete).toHaveBeenCalledWith('tech-subm-uuid');
      expect(mockGroupApi.delete).not.toHaveBeenCalledWith('tech-admin-uuid');
      expect(mockCollectionApi.delete).toHaveBeenCalledWith('coll-new');
    });

    /**
     * Verifica que el upload del logo vaya al final, tras cablear ambos grupos.
     * No pasa por replaceLogo$ porque una collection recién creada nunca tiene logo previo.
     */
    it('should upload the cover file at the end of the pipeline when coverFile is provided', async () => {
      setupFacadeWithCaller('superadmin', null);
      const cover = new File(['png'], 'cover.png', { type: 'image/png' });

      await firstValueFrom(
        facade.createColeccion$('parent-comm-uuid', sampleBody, cover),
      );

      expect(mockCollectionApi.uploadLogo).toHaveBeenCalledWith('coll-new', cover);
      const uploadOrder = mockCollectionApi.uploadLogo.mock.invocationCallOrder[0];
      const addSubgroupOrder = mockGroupApi.addSubgroup.mock.invocationCallOrder.at(-1);
      expect(uploadOrder).toBeGreaterThan(addSubgroupOrder!);
    });

    /** Verifica que omitir coverFile no dispare uploadLogo y deje el flujo intacto. */
    it('should NOT call uploadLogo when coverFile is omitted', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(
        facade.createColeccion$('parent-comm-uuid', sampleBody),
      );

      expect(mockCollectionApi.uploadLogo).not.toHaveBeenCalled();
    });

    /**
     * Verifica rollback cascada (admin → submit → collection) cuando falla el upload del logo.
     * Mantiene la atomicidad del facade: un PNG mal subido no debe dejar grupos huérfanos.
     */
    it('should rollback techAdmin, techSubmit and collection when uploadLogo fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      const cover = new File(['png'], 'cover.png', { type: 'image/png' });
      mockCollectionApi.uploadLogo = vi.fn(() =>
        throwError(() => new Error('500 uploading logo')),
      );

      await expect(
        firstValueFrom(
          facade.createColeccion$('parent-comm-uuid', sampleBody, cover),
        ),
      ).rejects.toThrow();
      expect(mockGroupApi.delete).toHaveBeenCalledWith('tech-admin-uuid');
      expect(mockGroupApi.delete).toHaveBeenCalledWith('tech-subm-uuid');
      expect(mockCollectionApi.delete).toHaveBeenCalledWith('coll-new');
    });

    /**
     * Verifica que si falla el segundo addSubgroup (SUBMITTERS al admin
     * técnico), el cleanup deshaga en cascada inversa: admin técnico, submit
     * técnico y collection. Es el escenario con más residuos posibles.
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
        firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody)),
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
        resourceScopeUuid: 'ED_BASICA',
        caller: { role: 'superadmin', scopeUuid: null },
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

  describe('replaceLogo$', () => {
    const sampleFile = new File(['png'], 'logo.png', { type: 'image/png' });

    /** Verifica que valide scope y, sin logo previo, suba directo el nuevo bitstream. */
    it('should validate scope, upload directly when no logo exists, and return the new bitstream', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockCollectionApi.getLogo = vi.fn(() => of(null));

      const result = await firstValueFrom(
        facade.replaceLogo$('coll-1', sampleFile, 'ED_BASICA'),
      );

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'collection',
        resourceScopeUuid: 'ED_BASICA',
        caller: { role: 'superadmin', scopeUuid: null },
      });
      expect(mockCollectionApi.getLogo).toHaveBeenCalledWith('coll-1');
      expect(mockBundleApi.deleteBitstream).not.toHaveBeenCalled();
      expect(mockCollectionApi.uploadLogo).toHaveBeenCalledWith('coll-1', sampleFile);
      expect(result).toEqual({ uuid: 'new-logo-bs' });
    });

    /**
     * Verifica el orden DELETE → POST cuando ya hay logo.
     * DSpace 9 tira 422 si se hace POST sobre un logo existente, por eso el delete va primero.
     */
    it('should delete the existing logo bitstream before uploading the new one', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockCollectionApi.getLogo = vi.fn(() =>
        of({ uuid: 'old-logo-bs', name: 'old.png' }),
      );

      await firstValueFrom(facade.replaceLogo$('coll-1', sampleFile, 'ED_BASICA'));

      expect(mockBundleApi.deleteBitstream).toHaveBeenCalledWith('old-logo-bs');
      expect(mockCollectionApi.uploadLogo).toHaveBeenCalledWith('coll-1', sampleFile);
      // Orden: primero delete, después upload.
      const deleteOrder = mockBundleApi.deleteBitstream.mock.invocationCallOrder[0];
      const uploadOrder = mockCollectionApi.uploadLogo.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(uploadOrder);
    });

    /** Verifica que OUT_OF_SCOPE corte el flujo antes de tocar HTTP. */
    it('should throw OUT_OF_SCOPE without touching HTTP when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_TRABAJO');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(
        firstValueFrom(facade.replaceLogo$('coll-1', sampleFile, 'ED_BASICA')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCollectionApi.getLogo).not.toHaveBeenCalled();
      expect(mockCollectionApi.uploadLogo).not.toHaveBeenCalled();
      expect(mockBundleApi.deleteBitstream).not.toHaveBeenCalled();
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

  describe('audit trail integration', () => {
    /** Verifica que createColeccion$ invoque audit.appendProvenance$ con la acción Created al cerrar el pipeline transaccional. */
    it('should call audit.appendProvenance$ with "Created" after a successful createColeccion$', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.createColeccion$('parent-comm-uuid', sampleBody));

      expect(mockAudit.appendProvenance$).toHaveBeenCalledWith('collection', 'coll-new', 'Created');
    });

    /** Verifica que updateColeccion$ invoque audit.appendProvenance$ con la acción Edited al cerrar el PATCH exitoso. */
    it('should call audit.appendProvenance$ with "Edited" after a successful updateColeccion$', async () => {
      setupFacadeWithCaller('superadmin', null);
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'Renombrada' },
      ];

      await firstValueFrom(facade.updateColeccion$('coll-1', patch, 'ED_BASICA'));

      expect(mockAudit.appendProvenance$).toHaveBeenCalledWith('collection', 'coll-new', 'Edited');
    });

    /** Verifica que deleteColeccion$ NO invoque al audit: el DSO es destruido y no puede recibir entradas. */
    it('should NOT call audit.appendProvenance$ on deleteColeccion$ (DSO destroyed)', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.deleteColeccion$('coll-1', 'ED_BASICA'));

      expect(mockAudit.appendProvenance$).not.toHaveBeenCalled();
    });
  });
});
