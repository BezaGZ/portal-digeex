import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';
import { ItemAdminFacade } from './item-admin-facade';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { BundleApiService } from '../../../../core/api/bundle-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { AuditTrailService } from '../provenance/audit-trail.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';
import { Caller } from '../specifications/scope-context.model';
import { UserRole } from '../../users/models/user-view.model';

type ItemApiMock = {
  updateMetadata: Mock;
  withdraw: Mock;
  restore: Mock;
  getOne: Mock;
  delete: Mock;
};
type BundleApiMock = {
  listForItem: Mock;
  createBundle: Mock;
  uploadBitstream: Mock;
  listBitstreams: Mock;
  deleteBitstream: Mock;
};
type ScopeMock = { assertWithinScope: Mock };
type AuthCallerMock = { currentCaller$: Observable<Caller | null> };
type AuditMock = { appendProvenance$: Mock };

/**
 * Tests de ItemAdminFacade.
 *
 * El facade orquesta la edición y el soft delete de items archivados:
 * updateItem$ aplica un parche de metadata, withdrawItem$ marca el item
 * como retirado y restoreItem$ lo devuelve al portal público. Cada
 * método valida scope antes de tocar HTTP. La inferencia del sufijo
 * desde el item al árbol jerárquico no se hace acá: la UI lo conoce
 * porque navega desde la colección y se lo pasa al facade.
 *
 * Ciclo 15 TDD — Sprint 6. Ajustado en Ciclos 34, 20 y 21 (Sprint 8) y Ciclo 31 (Sprint 10).
 */
describe('ItemAdminFacade', () => {
  let facade: ItemAdminFacade;
  let mockItemApi: ItemApiMock;
  let mockBundleApi: BundleApiMock;
  let mockScope: ScopeMock;
  let mockAuthCaller: AuthCallerMock;
  let mockAudit: AuditMock;

  const archivedItem = {
    uuid: 'item-uuid',
    name: 'Documento DIGEEX',
    handle: '123456789/500',
    metadata: {},
    inArchive: true,
    discoverable: true,
    withdrawn: false,
    lastModified: '2026-05-05T00:00:00Z',
    type: 'item',
  };

  function setupFacadeWithCaller(role: UserRole, scopeUuid: string | null) {
    mockAuthCaller = { currentCaller$: of({ role, scopeUuid }) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ItemAdminFacade,
        { provide: ItemApiService, useValue: mockItemApi },
        { provide: BundleApiService, useValue: mockBundleApi },
        { provide: ContentScopeService, useValue: mockScope },
        { provide: AuthCallerService, useValue: mockAuthCaller },
        { provide: AuditTrailService, useValue: mockAudit },
      ],
    });
    facade = TestBed.inject(ItemAdminFacade);
  }

  beforeEach(() => {
    mockItemApi = {
      updateMetadata: vi.fn(() => of(archivedItem)),
      withdraw: vi.fn(() => of({ ...archivedItem, withdrawn: true })),
      restore: vi.fn(() => of({ ...archivedItem, withdrawn: false })),
      getOne: vi.fn(() => of(archivedItem)),
      delete: vi.fn(() => of(undefined)),
    };
    mockBundleApi = {
      listForItem: vi.fn(() => of({ _embedded: { bundles: [] } })),
      createBundle: vi.fn(() => of({ uuid: 'thumb-bundle-uuid', name: 'THUMBNAIL' })),
      uploadBitstream: vi.fn(() => of({ uuid: 'cover-bs-uuid' })),
      listBitstreams: vi.fn(() =>
        of({ items: [], totalElements: 0, totalPages: 0, size: 20, page: 0 }),
      ),
      deleteBitstream: vi.fn(() => of(undefined)),
    };
    mockScope = { assertWithinScope: vi.fn() };
    mockAudit = { appendProvenance$: vi.fn(() => of(undefined)) };
  });

  describe('updateItem$', () => {
    it('should validate scope and PATCH the item when superadmin', async () => {
      setupFacadeWithCaller('superadmin', null);
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'Renombrado' },
      ];

      const result = await firstValueFrom(
        facade.updateItem$('item-uuid', patch, 'ED_BASICA'),
      );

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'item',
        resourceScopeUuid: 'ED_BASICA',
        caller: { role: 'superadmin', scopeUuid: null },
      });
      expect(mockItemApi.updateMetadata).toHaveBeenCalledWith('item-uuid', patch);
      expect(result.uuid).toBe('item-uuid');
    });

    it('should throw OUT_OF_SCOPE without PATCH when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(
        firstValueFrom(facade.updateItem$('item-uuid', [], 'ED_TRABAJO')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockItemApi.updateMetadata).not.toHaveBeenCalled();
    });
  });

  describe('withdrawItem$', () => {
    it('should validate scope and call ItemApiService.withdraw when superadmin', async () => {
      setupFacadeWithCaller('superadmin', null);

      const result = await firstValueFrom(facade.withdrawItem$('item-uuid', 'ED_BASICA'));

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'item',
        resourceScopeUuid: 'ED_BASICA',
        caller: { role: 'superadmin', scopeUuid: null },
      });
      expect(mockItemApi.withdraw).toHaveBeenCalledWith('item-uuid');
      expect(result.withdrawn).toBe(true);
    });

    it('should throw OUT_OF_SCOPE without HTTP call when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(
        firstValueFrom(facade.withdrawItem$('item-uuid', 'ED_TRABAJO')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockItemApi.withdraw).not.toHaveBeenCalled();
    });
  });

  describe('editItem$', () => {
    const itemPriv = { ...archivedItem, discoverable: false };

    /** Verifica que el step de metadata patch se ejecute cuando viene patch en el payload. */
    it('should apply metadata patch when patch is provided', async () => {
      setupFacadeWithCaller('superadmin', null);
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'X' },
      ];

      await firstValueFrom(
        facade.editItem$('item-uuid', { patch, item: archivedItem }, 'ED_BASICA'),
      );

      expect(mockItemApi.updateMetadata).toHaveBeenCalledWith('item-uuid', patch);
    });

    /** Verifica que el cambio a private emita PATCH /discoverable=false. */
    it('should PATCH /discoverable=false when visibility changes to private', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], visibility: 'private', item: archivedItem },
          'ED_BASICA',
        ),
      );

      const calls = mockItemApi.updateMetadata.mock.calls;
      const visibilityCall = calls.find((c) =>
        (c[1] as JsonPatchEntry[]).some((p) => p.path === '/discoverable'),
      );
      expect(visibilityCall).toBeDefined();
      expect(visibilityCall![1]).toEqual([
        { op: 'replace', path: '/discoverable', value: false },
      ]);
    });

    /** Verifica que el cambio a public emita PATCH /discoverable=true. */
    it('should PATCH /discoverable=true when visibility changes to public', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], visibility: 'public', item: itemPriv },
          'ED_BASICA',
        ),
      );

      const calls = mockItemApi.updateMetadata.mock.calls;
      const visibilityCall = calls.find((c) =>
        (c[1] as JsonPatchEntry[]).some((p) => p.path === '/discoverable'),
      );
      expect(visibilityCall).toBeDefined();
      expect(visibilityCall![1]).toEqual([
        { op: 'replace', path: '/discoverable', value: true },
      ]);
    });

    /** Verifica que el step de visibility se omita cuando el target coincide con item.discoverable. */
    it('should NOT touch visibility when it equals the current item.discoverable', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], visibility: 'public', item: archivedItem },
          'ED_BASICA',
        ),
      );

      const visibilityCall = mockItemApi.updateMetadata.mock.calls.find((c) =>
        (c[1] as JsonPatchEntry[]).some((p) => p.path === '/discoverable'),
      );
      expect(visibilityCall).toBeUndefined();
    });

    /** Verifica que se cree el bundle THUMBNAIL y se suba el bitstream cuando el item no tenía uno. */
    it('should upload the cover to a new THUMBNAIL bundle when none exists', async () => {
      setupFacadeWithCaller('superadmin', null);
      const cover = new File([''], 'cover.jpg', { type: 'image/jpeg' });

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], coverFile: cover, item: archivedItem },
          'ED_BASICA',
        ),
      );

      expect(mockBundleApi.listForItem).toHaveBeenCalledWith('item-uuid');
      expect(mockBundleApi.createBundle).toHaveBeenCalledWith('item-uuid', 'THUMBNAIL');
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('thumb-bundle-uuid', cover);
    });

    /** Verifica que el bundle THUMBNAIL existente se reuse en lugar de crear uno nuevo. */
    it('should reuse the existing THUMBNAIL bundle when one already exists', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem.mockReturnValueOnce(
        of({ _embedded: { bundles: [{ uuid: 'existing-thumb', name: 'THUMBNAIL' }] } }),
      );
      const cover = new File([''], 'cover.jpg', { type: 'image/jpeg' });

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], coverFile: cover, item: archivedItem },
          'ED_BASICA',
        ),
      );

      expect(mockBundleApi.createBundle).not.toHaveBeenCalled();
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('existing-thumb', cover);
    });

    /** Verifica que los bitstreams previos del bundle THUMBNAIL se borren antes de subir el cover nuevo. */
    it('should delete existing bitstreams from the THUMBNAIL bundle before uploading the new cover', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem.mockReturnValueOnce(
        of({ _embedded: { bundles: [{ uuid: 'existing-thumb', name: 'THUMBNAIL' }] } }),
      );
      mockBundleApi.listBitstreams.mockReturnValueOnce(
        of({
          items: [{ uuid: 'old-bs-1' }, { uuid: 'old-bs-2' }],
          totalElements: 2,
          totalPages: 1,
          size: 20,
          page: 0,
        }),
      );
      const cover = new File([''], 'cover.jpg', { type: 'image/jpeg' });

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], coverFile: cover, item: archivedItem },
          'ED_BASICA',
        ),
      );

      expect(mockBundleApi.listBitstreams).toHaveBeenCalledWith('existing-thumb');
      expect(mockBundleApi.deleteBitstream).toHaveBeenCalledWith('old-bs-1');
      expect(mockBundleApi.deleteBitstream).toHaveBeenCalledWith('old-bs-2');
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('existing-thumb', cover);
      // Los deletes deben ocurrir antes del upload (orden de invocación).
      const deleteOrder = mockBundleApi.deleteBitstream.mock.invocationCallOrder;
      const uploadOrder = mockBundleApi.uploadBitstream.mock.invocationCallOrder;
      expect(Math.max(...deleteOrder)).toBeLessThan(uploadOrder[0]);
    });

    /** Verifica que un bundle THUMBNAIL recién creado no dispare listBitstreams ni deleteBitstream. */
    it('should NOT list or delete bitstreams when the THUMBNAIL bundle is created fresh', async () => {
      setupFacadeWithCaller('superadmin', null);
      const cover = new File([''], 'cover.jpg', { type: 'image/jpeg' });

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], coverFile: cover, item: archivedItem },
          'ED_BASICA',
        ),
      );

      expect(mockBundleApi.listBitstreams).not.toHaveBeenCalled();
      expect(mockBundleApi.deleteBitstream).not.toHaveBeenCalled();
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('thumb-bundle-uuid', cover);
    });

    /** Verifica que editItem$ borre cada uuid listado en bitstreamsToRemove. */
    it('should DELETE each bitstream listed in bitstreamsToRemove', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          {
            patch: [],
            bitstreamsToRemove: ['old-bs-1', 'old-bs-2'],
            item: archivedItem,
          },
          'ED_BASICA',
        ),
      );

      expect(mockBundleApi.deleteBitstream).toHaveBeenCalledWith('old-bs-1');
      expect(mockBundleApi.deleteBitstream).toHaveBeenCalledWith('old-bs-2');
    });

    /** Verifica que editItem$ resuelva ORIGINAL y suba cada File de bitstreamsToAdd. */
    it('should POST each file in bitstreamsToAdd to the ORIGINAL bundle', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem.mockReturnValueOnce(
        of({
          _embedded: {
            bundles: [
              { uuid: 'original-bundle-uuid', name: 'ORIGINAL' },
              { uuid: 'thumb-bundle-uuid', name: 'THUMBNAIL' },
            ],
          },
        }),
      );
      const f1 = new File(['a'], 'a.pdf', { type: 'application/pdf' });
      const f2 = new File(['b'], 'b.pdf', { type: 'application/pdf' });

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          { patch: [], bitstreamsToAdd: [f1, f2], item: archivedItem },
          'ED_BASICA',
        ),
      );

      expect(mockBundleApi.listForItem).toHaveBeenCalledWith('item-uuid');
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('original-bundle-uuid', f1);
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('original-bundle-uuid', f2);
    });

    /** Verifica que los borrados se ejecuten antes de las subidas cuando ambos arrays están presentes. */
    it('should run deletes before uploads when both bitstreamsToRemove and bitstreamsToAdd are present', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem.mockReturnValueOnce(
        of({ _embedded: { bundles: [{ uuid: 'original-bundle-uuid', name: 'ORIGINAL' }] } }),
      );
      const newFile = new File(['x'], 'new.pdf', { type: 'application/pdf' });

      await firstValueFrom(
        facade.editItem$(
          'item-uuid',
          {
            patch: [],
            bitstreamsToRemove: ['old-bs-1'],
            bitstreamsToAdd: [newFile],
            item: archivedItem,
          },
          'ED_BASICA',
        ),
      );

      const deleteOrder = mockBundleApi.deleteBitstream.mock.invocationCallOrder;
      const uploadOrder = mockBundleApi.uploadBitstream.mock.invocationCallOrder;
      expect(Math.max(...deleteOrder)).toBeLessThan(uploadOrder[0]);
    });

    /** Verifica que listOriginalBitstreams$ resuelva ORIGINAL y delegue al wrapper paginado. */
    it('should resolve the ORIGINAL bundle and return its bitstreams paginated', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem.mockReturnValueOnce(
        of({
          _embedded: {
            bundles: [
              { uuid: 'original-bundle-uuid', name: 'ORIGINAL' },
              { uuid: 'thumb-bundle-uuid', name: 'THUMBNAIL' },
            ],
          },
        }),
      );
      mockBundleApi.listBitstreams.mockReturnValueOnce(
        of({
          items: [{ uuid: 'bs-1', name: 'a.pdf', sizeBytes: 1000 }],
          totalElements: 1,
          totalPages: 1,
          size: 20,
          page: 0,
        }),
      );

      const result = await firstValueFrom(
        facade.listOriginalBitstreams$('item-uuid', 0, 20),
      );

      expect(mockBundleApi.listForItem).toHaveBeenCalledWith('item-uuid');
      expect(mockBundleApi.listBitstreams).toHaveBeenCalledWith(
        'original-bundle-uuid',
        0,
        20,
      );
      expect(result.items[0].uuid).toBe('bs-1');
      expect(result.totalElements).toBe(1);
    });

    /** Verifica que el scope se valide antes de cualquier HTTP en el flujo de edit. */
    it('should reject with OUT_OF_SCOPE before any HTTP call when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(
        firstValueFrom(
          facade.editItem$(
            'item-uuid',
            { patch: [], visibility: 'private', item: archivedItem },
            'ED_TRABAJO',
          ),
        ),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockItemApi.updateMetadata).not.toHaveBeenCalled();
      expect(mockBundleApi.uploadBitstream).not.toHaveBeenCalled();
    });
  });

  describe('restoreItem$', () => {
    it('should validate scope and call ItemApiService.restore when superadmin', async () => {
      setupFacadeWithCaller('superadmin', null);

      const result = await firstValueFrom(facade.restoreItem$('item-uuid', 'ED_BASICA'));

      expect(mockItemApi.restore).toHaveBeenCalledWith('item-uuid');
      expect(result.withdrawn).toBe(false);
    });

    it('should throw OUT_OF_SCOPE without HTTP call when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(
        firstValueFrom(facade.restoreItem$('item-uuid', 'ED_TRABAJO')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockItemApi.restore).not.toHaveBeenCalled();
    });
  });

  describe('deleteItem$', () => {
    it('should call ItemApiService.delete when superadmin', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.deleteItem$('item-uuid'));

      expect(mockItemApi.delete).toHaveBeenCalledWith('item-uuid');
    });

    it('should reject with BusinessRuleError without calling delete when admin_subdireccion', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');

      await expect(
        firstValueFrom(facade.deleteItem$('item-uuid')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockItemApi.delete).not.toHaveBeenCalled();
    });

    it('should reject with BusinessRuleError without calling delete when personal_delegado', async () => {
      setupFacadeWithCaller('personal_delegado', 'ED_BASICA');

      await expect(
        firstValueFrom(facade.deleteItem$('item-uuid')),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockItemApi.delete).not.toHaveBeenCalled();
    });
  });

  describe('audit trail integration', () => {
    /** Verifica que updateItem$ invoque audit.appendProvenance$ con la acción Edited. */
    it('should call audit.appendProvenance$ with "Edited" after a successful updateItem$', async () => {
      setupFacadeWithCaller('superadmin', null);
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'X' },
      ];

      await firstValueFrom(facade.updateItem$('item-uuid', patch, 'ED_BASICA'));

      expect(mockAudit.appendProvenance$).toHaveBeenCalledWith('item', 'item-uuid', 'Edited');
    });

    /** Verifica que editItem$ invoque audit.appendProvenance$ con la acción Edited al cierre. */
    it('should call audit.appendProvenance$ with "Edited" after a successful editItem$', async () => {
      setupFacadeWithCaller('superadmin', null);
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'X' },
      ];

      await firstValueFrom(
        facade.editItem$('item-uuid', { patch, item: archivedItem }, 'ED_BASICA'),
      );

      expect(mockAudit.appendProvenance$).toHaveBeenCalledWith('item', 'item-uuid', 'Edited');
    });

    /**
     * Verifica que withdrawItem$ NO llame al audit: DSpace 9 escribe
     * `Item withdrawn by …` automáticamente y un audit manual duplicaría.
     */
    it('should NOT call audit.appendProvenance$ on withdrawItem$ (DSpace writes the native entry)', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.withdrawItem$('item-uuid', 'ED_BASICA'));

      expect(mockAudit.appendProvenance$).not.toHaveBeenCalled();
    });

    /** Verifica que restoreItem$ tampoco llame al audit. */
    it('should NOT call audit.appendProvenance$ on restoreItem$ (DSpace writes the native entry)', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.restoreItem$('item-uuid', 'ED_BASICA'));

      expect(mockAudit.appendProvenance$).not.toHaveBeenCalled();
    });

    /** Verifica best-effort: editItem$ emite el item exitoso aunque el audit falle. */
    it('should emit the successful item even when audit.appendProvenance$ errors (best-effort)', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockAudit.appendProvenance$.mockReturnValue(throwError(() => new Error('500 audit failed')));
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'X' },
      ];

      const result = await firstValueFrom(facade.updateItem$('item-uuid', patch, 'ED_BASICA'));

      expect(result.uuid).toBe('item-uuid');
      expect(mockAudit.appendProvenance$).toHaveBeenCalledTimes(1);
    });
  });
});
