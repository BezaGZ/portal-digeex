import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';
import { CommunityFacade } from './community-facade';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { GroupApiService } from '../../../../core/api/group-api.service';
import { ContentScopeService } from './content-scope.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { CommunityCreateBody } from '../../../../core/api/models/community.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';

type CommunityApiMock = {
  searchTop: Mock;
  create: Mock;
  createAdminGroup: Mock;
  updateMetadata: Mock;
  delete: Mock;
};
type GroupApiMock = {
  create: Mock;
  addSubgroup: Mock;
  delete: Mock;
  getByName: Mock;
};
type ScopeMock = { assertWithinScope: Mock };
type AuthCallerMock = { currentCaller$: ReturnType<typeof of> };

/**
 * Tests de CommunityFacade.
 *
 * El facade orquesta create/update/delete de subdirecciones (sub-comunidades
 * de DIGEEX raíz). Cada método valida scope antes de tocar HTTP, ejecuta el
 * pipeline transaccional y deshace lo creado en cascada inversa cuando un
 * paso intermedio falla.
 *
 * Ciclo 12 TDD — Sprint 6
 */
describe('CommunityFacade', () => {
  let facade: CommunityFacade;
  let mockCommunityApi: CommunityApiMock;
  let mockGroupApi: GroupApiMock;
  let mockScope: ScopeMock;
  let mockAuthCaller: AuthCallerMock;

  const newCommunity = {
    uuid: 'comm-new',
    name: 'Subdirección de Calidad',
    handle: '123456789/200',
    type: 'community',
    metadata: {},
    archivedItemsCount: -1,
    _links: {},
  };

  const techAdminGroup = {
    uuid: 'tech-admin-uuid',
    name: 'COMMUNITY_comm-new_ADMIN',
    permanent: false,
    type: 'group',
    _links: {},
  };

  const standaloneAdmin = {
    uuid: 'standalone-admin-uuid',
    name: 'ADMIN_ED_CALIDAD',
    permanent: false,
    type: 'group',
    _links: {},
  };

  const standaloneSubmitters = {
    uuid: 'standalone-submitters-uuid',
    name: 'SUBMITTERS_ED_CALIDAD',
    permanent: false,
    type: 'group',
    _links: {},
  };

  const sampleBody: CommunityCreateBody = {
    name: 'Subdirección de Calidad',
    metadata: {
      'dc.title': [
        { value: 'Subdirección de Calidad', language: null, authority: null, confidence: -1, place: 0 },
      ],
    },
    type: 'community',
  };

  function setupFacadeWithCaller(role: string, sufijo: string | null) {
    mockAuthCaller = {
      currentCaller$: of({ role, sufijo }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        CommunityFacade,
        { provide: CommunityApiService, useValue: mockCommunityApi },
        { provide: GroupApiService, useValue: mockGroupApi },
        { provide: ContentScopeService, useValue: mockScope },
        { provide: AuthCallerService, useValue: mockAuthCaller },
      ],
    });
    facade = TestBed.inject(CommunityFacade);
  }

  beforeEach(() => {
    mockCommunityApi = {
      searchTop: vi.fn(() => of({
        _embedded: { communities: [{ uuid: 'digeex-root-uuid' }] },
        _links: {},
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
      })),
      create: vi.fn(() => of(newCommunity)),
      createAdminGroup: vi.fn(() => of(techAdminGroup)),
      updateMetadata: vi.fn(() => of({ ...newCommunity, name: 'Renombrada' })),
      delete: vi.fn(() => of(undefined)),
    };
    mockGroupApi = {
      create: vi.fn()
        .mockReturnValueOnce(of(standaloneAdmin))
        .mockReturnValueOnce(of(standaloneSubmitters)),
      addSubgroup: vi.fn(() => of(undefined)),
      delete: vi.fn(() => of(undefined)),
      getByName: vi.fn(),
    };
    mockScope = {
      assertWithinScope: vi.fn(),
    };
  });

  describe('createSubdireccion$', () => {
    it('should validate scope, then chain 5 HTTP calls in order, returning the new community', async () => {
      setupFacadeWithCaller('superadmin', null);

      const result = await firstValueFrom(facade.createSubdireccion$(sampleBody, 'ED_CALIDAD'));

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'community-toplevel',
        resourceSufijo: null,
        caller: { role: 'superadmin', sufijo: null },
      });
      expect(mockCommunityApi.searchTop).toHaveBeenCalled();
      expect(mockCommunityApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Subdirección de Calidad',
          metadata: expect.objectContaining({
            'digeex.sufijo': expect.arrayContaining([
              expect.objectContaining({ value: 'ED_CALIDAD' }),
            ]),
          }),
        }),
        'digeex-root-uuid',
      );
      expect(mockCommunityApi.createAdminGroup).toHaveBeenCalledWith('comm-new', expect.any(Object));
      expect(mockGroupApi.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'ADMIN_ED_CALIDAD' }));
      expect(mockGroupApi.addSubgroup).toHaveBeenCalledWith('tech-admin-uuid', expect.stringContaining('standalone-admin-uuid'));
      expect(mockGroupApi.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'SUBMITTERS_ED_CALIDAD' }));
      expect(result).toEqual(newCommunity);
    });

    it('should throw OUT_OF_SCOPE without making HTTP calls when caller is admin_subdireccion', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });

      await expect(firstValueFrom(facade.createSubdireccion$(sampleBody, 'ED_X'))).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCommunityApi.searchTop).not.toHaveBeenCalled();
      expect(mockCommunityApi.create).not.toHaveBeenCalled();
    });

    it('should rollback the created community when SUBMITTERS group creation fails', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockGroupApi.create = vi.fn()
        .mockReturnValueOnce(of(standaloneAdmin))
        .mockReturnValueOnce(throwError(() => new Error('422 Conflict on SUBMITTERS')));

      await expect(firstValueFrom(facade.createSubdireccion$(sampleBody, 'ED_CALIDAD'))).rejects.toThrow();
      expect(mockGroupApi.delete).toHaveBeenCalledWith('standalone-admin-uuid');
      expect(mockCommunityApi.delete).toHaveBeenCalledWith('comm-new');
    });
  });

  describe('updateSubdireccion$', () => {
    it('should validate scope and PATCH the community when superadmin', async () => {
      setupFacadeWithCaller('superadmin', null);
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'Renombrada' },
      ];

      const result = await firstValueFrom(facade.updateSubdireccion$('comm-1', patch, 'ED_BASICA'));

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'community-sub',
        resourceSufijo: 'ED_BASICA',
        caller: { role: 'superadmin', sufijo: null },
      });
      expect(mockCommunityApi.updateMetadata).toHaveBeenCalledWith('comm-1', patch);
      expect(result.name).toBe('Renombrada');
    });

    it('should pass admin_subdireccion sufijo into scope context for matching check', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'Editada' },
      ];

      await firstValueFrom(facade.updateSubdireccion$('comm-1', patch, 'ED_BASICA'));

      expect(mockScope.assertWithinScope).toHaveBeenCalledWith({
        dsoType: 'community-sub',
        resourceSufijo: 'ED_BASICA',
        caller: { role: 'admin_subdireccion', sufijo: 'ED_BASICA' },
      });
    });

    it('should throw OUT_OF_SCOPE without PATCH when scope rejects', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'rejected');
      });
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/metadata/dc.title/0/value', value: 'X' },
      ];

      await expect(firstValueFrom(facade.updateSubdireccion$('comm-other', patch, 'ED_TRABAJO'))).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockCommunityApi.updateMetadata).not.toHaveBeenCalled();
    });
  });

  describe('deleteSubdireccion$', () => {
    it('should validate scope, then delete SUBMITTERS, ADMIN, and community in order', async () => {
      setupFacadeWithCaller('superadmin', null);
      mockGroupApi.getByName = vi.fn()
        .mockReturnValueOnce(of(standaloneSubmitters))
        .mockReturnValueOnce(of(standaloneAdmin));

      await firstValueFrom(facade.deleteSubdireccion$('comm-1', 'ED_CALIDAD'));

      expect(mockScope.assertWithinScope).toHaveBeenCalled();
      expect(mockGroupApi.getByName).toHaveBeenNthCalledWith(1, 'SUBMITTERS_ED_CALIDAD');
      expect(mockGroupApi.delete).toHaveBeenNthCalledWith(1, 'standalone-submitters-uuid');
      expect(mockGroupApi.getByName).toHaveBeenNthCalledWith(2, 'ADMIN_ED_CALIDAD');
      expect(mockGroupApi.delete).toHaveBeenNthCalledWith(2, 'standalone-admin-uuid');
      expect(mockCommunityApi.delete).toHaveBeenCalledWith('comm-1');
    });

    it('should throw OUT_OF_SCOPE without any delete when caller is admin_subdireccion', async () => {
      setupFacadeWithCaller('admin_subdireccion', 'ED_BASICA');
      mockScope.assertWithinScope.mockImplementation(() => {
        throw new BusinessRuleError('OUT_OF_SCOPE', 'only superadmin can delete');
      });

      await expect(firstValueFrom(facade.deleteSubdireccion$('comm-1', 'ED_BASICA'))).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockGroupApi.delete).not.toHaveBeenCalled();
      expect(mockCommunityApi.delete).not.toHaveBeenCalled();
    });
  });
});
