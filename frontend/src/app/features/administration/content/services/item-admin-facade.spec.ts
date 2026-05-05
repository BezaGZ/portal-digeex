import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { Mock, vi } from 'vitest';
import { ItemAdminFacade } from './item-admin-facade';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';

type ItemApiMock = {
  updateMetadata: Mock;
  withdraw: Mock;
  restore: Mock;
};
type ScopeMock = { assertWithinScope: Mock };
type AuthCallerMock = { currentCaller$: ReturnType<typeof of> };

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
 * Ciclo 15 TDD — Sprint 6
 */
describe('ItemAdminFacade', () => {
  let facade: ItemAdminFacade;
  let mockItemApi: ItemApiMock;
  let mockScope: ScopeMock;
  let mockAuthCaller: AuthCallerMock;

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

  function setupFacadeWithCaller(role: string, sufijo: string | null) {
    mockAuthCaller = { currentCaller$: of({ role, sufijo }) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ItemAdminFacade,
        { provide: ItemApiService, useValue: mockItemApi },
        { provide: ContentScopeService, useValue: mockScope },
        { provide: AuthCallerService, useValue: mockAuthCaller },
      ],
    });
    facade = TestBed.inject(ItemAdminFacade);
  }

  beforeEach(() => {
    mockItemApi = {
      updateMetadata: vi.fn(() => of(archivedItem)),
      withdraw: vi.fn(() => of({ ...archivedItem, withdrawn: true })),
      restore: vi.fn(() => of({ ...archivedItem, withdrawn: false })),
    };
    mockScope = { assertWithinScope: vi.fn() };
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
        resourceSufijo: 'ED_BASICA',
        caller: { role: 'superadmin', sufijo: null },
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
        resourceSufijo: 'ED_BASICA',
        caller: { role: 'superadmin', sufijo: null },
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
});
