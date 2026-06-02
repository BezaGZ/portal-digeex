import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';
import { SubmissionFacade, SubmitItemRequest } from './submission-facade';
import { WorkspaceItemApiService } from '../../../../core/api/workspaceitem-api.service';
import { BundleApiService } from '../../../../core/api/bundle-api.service';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { Caller } from '../specifications/scope-context.model';
import { UserRole } from '../../users/models/user-view.model';

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
type AuthCallerMock = { currentCaller$: Observable<Caller | null> };
type BundleApiMock = {
  listForItem: Mock;
  createBundle: Mock;
  uploadBitstream: Mock;
};

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
 * Ciclo 14 TDD — Sprint 6. Ajustado en Ciclo 30.
 */
describe('SubmissionFacade', () => {
  let facade: SubmissionFacade;
  let mockWorkspace: WorkspaceApiMock;
  let mockItemApi: ItemApiMock;
  let mockScope: ScopeMock;
  let mockAuthCaller: AuthCallerMock;
  let mockBundleApi: BundleApiMock;

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
      'dc.title': [{ value: 'Documento de prueba', language: null, authority: null, confidence: -1, place: 0 }],
      'dc.date.issued': [{ value: '2026', language: null, authority: null, confidence: -1, place: 0 }],
    },
    files: [new File(['contenido'], 'documento.pdf', { type: 'application/pdf' })],
    visibility: 'public',
    sufijoSubdireccion: 'ED_BASICA',
  };

  function setupFacadeWithCaller(role: UserRole, sufijo: string | null) {
    mockAuthCaller = { currentCaller$: of({ role, sufijo }) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SubmissionFacade,
        { provide: WorkspaceItemApiService, useValue: mockWorkspace },
        { provide: ItemApiService, useValue: mockItemApi },
        { provide: ContentScopeService, useValue: mockScope },
        { provide: AuthCallerService, useValue: mockAuthCaller },
        { provide: BundleApiService, useValue: mockBundleApi },
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
    mockBundleApi = {
      listForItem: vi.fn(() => of({ _embedded: { bundles: [] }, _links: {}, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } })),
      createBundle: vi.fn(() => of({ uuid: 'thumb-bundle-new', name: 'THUMBNAIL', type: 'bundle' })),
      uploadBitstream: vi.fn(() => of({ uuid: 'cover-bitstream', name: 'portada.jpg', type: 'bitstream' })),
    };
  });

  describe('submitItem$', () => {
    /** Verifica el flujo completo de submit público: scope, create, patch metadata, upload, license, commit. */
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

    /** Verifica que con visibility=private se hace PATCH /discoverable=false sobre el item archivado. */
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

    /** Verifica que un caller fuera de scope falle en seco sin emitir ninguna llamada HTTP. */
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

    /** Verifica que un fallo en patchSection borre el workspaceitem para dejar el backend limpio. */
    it('should rollback the workspaceitem when patchSection fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockWorkspace.patchSection = vi.fn(() => throwError(() => new Error('422 invalid metadata')));

      await expect(firstValueFrom(facade.submitItem$(sampleRequest))).rejects.toThrow();
      expect(mockWorkspace.delete).toHaveBeenCalledWith(99);
    });

    /** Verifica que un fallo en uploadFile dispare el rollback del workspaceitem. */
    it('should rollback the workspaceitem when uploadFile fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockWorkspace.uploadFile = vi.fn(() => throwError(() => new Error('413 file too large')));

      await expect(firstValueFrom(facade.submitItem$(sampleRequest))).rejects.toThrow();
      expect(mockWorkspace.delete).toHaveBeenCalledWith(99);
    });

    /** Verifica que cuando no se pasa coverFile, BundleApi no recibe ninguna llamada. */
    it('should NOT call BundleApi when coverFile is absent', async () => {
      setupFacadeWithCaller('superadmin', null);

      await firstValueFrom(facade.submitItem$(sampleRequest));

      expect(mockBundleApi.listForItem).not.toHaveBeenCalled();
      expect(mockBundleApi.createBundle).not.toHaveBeenCalled();
      expect(mockBundleApi.uploadBitstream).not.toHaveBeenCalled();
    });

    /** Verifica que el facade cree el bundle THUMBNAIL y suba la portada si no existe ya. */
    it('should create a THUMBNAIL bundle and upload the cover when no THUMBNAIL bundle exists', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem = vi.fn(() =>
        of({
          _embedded: { bundles: [{ uuid: 'orig-uuid', name: 'ORIGINAL', type: 'bundle' }] },
          _links: {},
          page: { size: 1, totalElements: 1, totalPages: 1, number: 0 },
        }),
      );
      const cover = new File(['img'], 'portada.jpg', { type: 'image/jpeg' });

      await firstValueFrom(facade.submitItem$({ ...sampleRequest, coverFile: cover }));

      expect(mockBundleApi.listForItem).toHaveBeenCalledWith('item-archived-uuid');
      expect(mockBundleApi.createBundle).toHaveBeenCalledWith('item-archived-uuid', 'THUMBNAIL');
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('thumb-bundle-new', cover);
    });

    /** Verifica que si ya existe un bundle THUMBNAIL, el facade lo reutilice y solo suba el bitstream. */
    it('should reuse the existing THUMBNAIL bundle when one already exists', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem = vi.fn(() =>
        of({
          _embedded: {
            bundles: [
              { uuid: 'orig-uuid', name: 'ORIGINAL', type: 'bundle' },
              { uuid: 'thumb-existing', name: 'THUMBNAIL', type: 'bundle' },
            ],
          },
          _links: {},
          page: { size: 2, totalElements: 2, totalPages: 1, number: 0 },
        }),
      );
      const cover = new File(['img'], 'portada.jpg', { type: 'image/jpeg' });

      await firstValueFrom(facade.submitItem$({ ...sampleRequest, coverFile: cover }));

      /* No se crea bundle nuevo, se sube el bitstream al existente. */
      expect(mockBundleApi.createBundle).not.toHaveBeenCalled();
      expect(mockBundleApi.uploadBitstream).toHaveBeenCalledWith('thumb-existing', cover);
    });

    /**
     * Verifica que los uploads se hagan secuencialmente con concatMap.
     * DSpace 9.x persiste el workspaceitem por POST sin lock optimista; uploads paralelos pisan bitstreams.
     */
    it('should upload files sequentially (concatMap), not concurrently, to avoid lost updates on the workspaceitem', async () => {
      setupFacadeWithCaller('superadmin', null);

      const fileA = new File(['a'], 'a.pdf', { type: 'application/pdf' });
      const fileB = new File(['b'], 'b.pdf', { type: 'application/pdf' });

      /**
       * Cada uploadFile devuelve un Subject que solo emite cuando lo controlamos
       * a mano; asi probamos el orden temporal y no solo el conteo de calls.
       */
      const uploadCalls: { file: File; subject: Subject<typeof newWorkspaceItem> }[] = [];
      mockWorkspace.uploadFile = vi.fn((_id: number, file: File) => {
        const subject = new Subject<typeof newWorkspaceItem>();
        uploadCalls.push({ file, subject });
        return subject.asObservable();
      });

      const sub = facade
        .submitItem$({ ...sampleRequest, files: [fileA, fileB] })
        .subscribe({ next: () => undefined, error: () => undefined });

      /* Cede el event loop para que el pipeline llegue a uploadAllFiles$. */
      await new Promise((resolve) => setTimeout(resolve, 0));

      /**
       * Si el facade fuera paralelo (mergeMap) ya habria invocado los dos
       * uploadFile; con concatMap solo arranca el primero hasta que complete.
       */
      expect(uploadCalls.length).toBe(1);
      expect(uploadCalls[0].file).toBe(fileA);

      uploadCalls[0].subject.next(newWorkspaceItem);
      uploadCalls[0].subject.complete();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(uploadCalls.length).toBe(2);
      expect(uploadCalls[1].file).toBe(fileB);

      /* Cierre limpio: el segundo upload completa para no dejar el subscribe colgado. */
      uploadCalls[1].subject.next(newWorkspaceItem);
      uploadCalls[1].subject.complete();
      sub.unsubscribe();
    });

    /**
     * Verifica que fallar tras el commit (en applyCover por ejemplo) NO
     * dispare el rollback de workspace.delete: el workspaceitem ya no
     * existe como tal, intentar borrarlo termina en 500 y oculta el éxito
     * del archive del item. El rollback solo aplica a errores pre-archive.
     */
    it('should NOT call workspace.delete when a post-archive step fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockBundleApi.listForItem = vi.fn(() =>
        throwError(() => new Error('post-archive failure')),
      );
      const cover = new File(['img'], 'portada.jpg', { type: 'image/jpeg' });

      await expect(
        firstValueFrom(facade.submitItem$({ ...sampleRequest, coverFile: cover })),
      ).rejects.toThrow();
      expect(mockWorkspace.delete).not.toHaveBeenCalled();
    });
  });
});
