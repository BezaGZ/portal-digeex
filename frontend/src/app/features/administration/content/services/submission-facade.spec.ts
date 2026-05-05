import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';
import { SubmissionFacade, SubmitItemRequest } from './submission-facade';
import { WorkspaceItemApiService } from '../../../../core/api/workspaceitem-api.service';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';

type WorkspaceApiMock = {
  create: Mock;
  patchSection: Mock;
  uploadFile: Mock;
  getItem: Mock;
  commit: Mock;
  delete: Mock;
};
type ItemApiMock = { updateMetadata: Mock };
type ScopeMock = { assertWithinScope: Mock };
type AuthCallerMock = { currentCaller$: ReturnType<typeof of> };

/**
 * Tests de SubmissionFacade.
 *
 * El facade orquesta la submission completa de un item: valida scope,
 * crea el workspaceitem sobre la collection destino, parcha la metadata
 * del form correspondiente, sube los archivos como bitstreams del bundle
 * ORIGINAL, acepta la licencia, commitea al workflow para archivar, y si
 * el caller marcó la submission como privada hace un PATCH adicional
 * sobre /discoverable del item ya archivado. Si cualquier paso después
 * de la creación del workspaceitem falla, borra el workspaceitem para
 * dejar el backend limpio.
 *
 * Ciclo 14 TDD — Sprint 6
 */
describe('SubmissionFacade', () => {
  let facade: SubmissionFacade;
  let mockWorkspace: WorkspaceApiMock;
  let mockItemApi: ItemApiMock;
  let mockScope: ScopeMock;
  let mockAuthCaller: AuthCallerMock;

  const newWorkspaceItem = {
    id: 99,
    type: 'workspaceitem' as const,
    sections: { license: { granted: false }, upload: { files: [] } },
  };
  const inProgressItem = {
    uuid: 'item-archived-uuid',
    name: 'Documento de prueba',
    handle: '123456789/999',
    metadata: {},
    inArchive: false,
    discoverable: true,
    withdrawn: false,
    lastModified: '2026-05-05T00:00:00Z',
    type: 'item',
  };

  const sampleRequest: SubmitItemRequest = {
    collectionUuid: 'coll-uuid',
    sectionName: 'traditionalpageone',
    metadata: {
      'dc.title': [{ value: 'Documento de prueba' }],
      'dc.date.issued': [{ value: '2026' }],
    },
    files: [new File(['contenido'], 'documento.pdf', { type: 'application/pdf' })],
    visibility: 'public',
    sufijoSubdireccion: 'ED_BASICA',
  };

  function setupFacadeWithCaller(role: string, sufijo: string | null) {
    mockAuthCaller = { currentCaller$: of({ role, sufijo }) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SubmissionFacade,
        { provide: WorkspaceItemApiService, useValue: mockWorkspace },
        { provide: ItemApiService, useValue: mockItemApi },
        { provide: ContentScopeService, useValue: mockScope },
        { provide: AuthCallerService, useValue: mockAuthCaller },
      ],
    });
    facade = TestBed.inject(SubmissionFacade);
  }

  beforeEach(() => {
    mockWorkspace = {
      create: vi.fn(() => of(newWorkspaceItem)),
      patchSection: vi.fn(() => of(newWorkspaceItem)),
      uploadFile: vi.fn(() => of(newWorkspaceItem)),
      getItem: vi.fn(() => of(inProgressItem)),
      commit: vi.fn(() => of(undefined)),
      delete: vi.fn(() => of(undefined)),
    };
    mockItemApi = { updateMetadata: vi.fn(() => of({ ...inProgressItem, discoverable: false })) };
    mockScope = { assertWithinScope: vi.fn() };
  });

  describe('submitItem$', () => {
    it('should validate scope, then chain workspace create + metadata patch + uploadFile per file + license + getItem + commit, returning the resolved item for a public submission', async () => {
      setupFacadeWithCaller('superadmin', null);

      const result = await firstValueFrom(facade.submitItem$(sampleRequest));

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'item',
        resourceSufijo: 'ED_BASICA',
        caller: { role: 'superadmin', sufijo: null },
      });
      expect(mockWorkspace.create).toHaveBeenCalledWith('coll-uuid');
      expect(mockWorkspace.patchSection).toHaveBeenCalledWith(
        99,
        expect.arrayContaining([
          expect.objectContaining({
            op: 'add',
            path: '/sections/traditionalpageone/dc.title',
          }),
        ]),
      );
      expect(mockWorkspace.uploadFile).toHaveBeenCalledWith(99, sampleRequest.files[0]);
      expect(mockWorkspace.patchSection).toHaveBeenCalledWith(
        99,
        expect.arrayContaining([
          expect.objectContaining({
            op: 'replace',
            path: '/sections/license/granted',
            value: true,
          }),
        ]),
      );
      expect(mockWorkspace.getItem).toHaveBeenCalledWith(99);
      expect(mockWorkspace.commit).toHaveBeenCalledWith(99);
      expect(mockItemApi.updateMetadata).not.toHaveBeenCalled();
      expect(result.uuid).toBe('item-archived-uuid');
    });

    it('should PATCH /discoverable=false on the archived item when visibility is private', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.submitItem$({ ...sampleRequest, visibility: 'private' }));

      expect(mockItemApi.updateMetadata).toHaveBeenCalledWith(
        'item-archived-uuid',
        expect.arrayContaining([
          expect.objectContaining({ op: 'replace', path: '/discoverable', value: false }),
        ]),
      );
    });

    it('should throw OUT_OF_SCOPE without making HTTP calls when caller sufijo does not match', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_TRABAJO');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(firstValueFrom(facade.submitItem$(sampleRequest))).rejects.toBeInstanceOf(
        BusinessRuleError,
      );
      expect(mockWorkspace.create).not.toHaveBeenCalled();
    });

    it('should rollback the workspaceitem when patchSection fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockWorkspace.patchSection = vi.fn(() => throwError(() => new Error('422 invalid metadata')));

      await expect(firstValueFrom(facade.submitItem$(sampleRequest))).rejects.toThrow();
      expect(mockWorkspace.delete).toHaveBeenCalledWith(99);
    });

    it('should rollback the workspaceitem when uploadFile fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockWorkspace.uploadFile = vi.fn(() => throwError(() => new Error('413 file too large')));

      await expect(firstValueFrom(facade.submitItem$(sampleRequest))).rejects.toThrow();
      expect(mockWorkspace.delete).toHaveBeenCalledWith(99);
    });
  });
});
