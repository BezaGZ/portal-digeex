/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EMPTY, Observable, of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';

import { Communities } from './communities';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CommunityFacade } from '../content/services/community-facade';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { Community } from '../../../core/api/models/community.model';
import { Caller } from '../content/specifications/scope-context.model';

/**
 * Tests del contenedor Communities.
 *
 * El contenedor lista las subdirecciones (sub-comunidades top-level de
 * la community raíz DIGEEX), expone botones de crear/editar/eliminar
 * según el rol del caller y delega las mutaciones al CommunityFacade.
 * Asume que el bootstrap (setup-dspace.sh) corrió y la community raíz
 * existe; si no existe, muestra un mensaje de sistema no inicializado.
 *
 * Ciclo 17 TDD — Sprint 6
 */
describe('Communities (contenedor)', () => {
  let searchTopFn: ReturnType<typeof vi.fn>;
  let listSubcommunitiesFn: ReturnType<typeof vi.fn>;
  let listByCommunityFn: ReturnType<typeof vi.fn>;
  let getItemsFn: ReturnType<typeof vi.fn>;
  let currentCallerObservable: Observable<Caller | null>;
  let createSubdireccionFn: ReturnType<typeof vi.fn>;
  let updateSubdireccionFn: ReturnType<typeof vi.fn>;
  let deleteSubdireccionFn: ReturnType<typeof vi.fn>;
  let confirmFn: ReturnType<typeof vi.fn>;
  let messageAddFn: ReturnType<typeof vi.fn>;

  function buildCommunity(name: string, uuid: string): Community {
    return {
      uuid,
      name,
      handle: `123456789/${uuid}`,
      metadata: {},
      archivedItemsCount: 0,
      type: 'community',
    };
  }

  beforeEach(() => {
    searchTopFn = vi.fn().mockReturnValue(
      of({
        _embedded: { communities: [buildCommunity('DIGEEX', 'digeex-root-uuid')] },
        _links: { self: { href: '/server/api/core/communities/search/top' } },
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
      }),
    );
    listSubcommunitiesFn = vi.fn().mockReturnValue(
      of({
        _embedded: {
          subcommunities: [
            buildCommunity('Educación Básica', 'sub-1'),
            buildCommunity('Trabajo y Cultura', 'sub-2'),
            buildCommunity('Investigación', 'sub-3'),
          ],
        },
        _links: { self: { href: '/server/api/core/communities/digeex-root-uuid/subcommunities' } },
        page: { size: 20, totalElements: 3, totalPages: 1, number: 0 },
      }),
    );
    listByCommunityFn = vi.fn().mockImplementation((uuid: string) =>
      of({
        _embedded: { collections: [] },
        _links: { self: { href: `/server/api/core/communities/${uuid}/collections` } },
        page: { size: 1, totalElements: 4, totalPages: 4, number: 0 },
      }),
    );
    getItemsFn = vi.fn().mockImplementation((uuid: string) =>
      of({
        _embedded: { items: [] },
        _links: { self: { href: `/server/api/discover/search/objects?scope=${uuid}` } },
        page: { size: 1, totalElements: 4, totalPages: 4, number: 0 },
      }),
    );
    currentCallerObservable = of({ role: 'superadmin', sufijo: null });
    createSubdireccionFn = vi.fn().mockReturnValue(of(buildCommunity('Nueva', 'sub-new')));
    updateSubdireccionFn = vi.fn().mockReturnValue(of(buildCommunity('Renombrada', 'sub-1')));
    deleteSubdireccionFn = vi.fn().mockReturnValue(of(undefined));
    messageAddFn = vi.fn();

    TestBed.configureTestingModule({
      imports: [Communities],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: CommunityApiService,
          useValue: {
            searchTop: searchTopFn,
            listSubcommunities: listSubcommunitiesFn,
          },
        },
        {
          provide: CollectionApiService,
          useValue: { listByCommunity: listByCommunityFn },
        },
        {
          provide: DSpaceApiService,
          useValue: { getItems: getItemsFn },
        },
        {
          provide: CommunityFacade,
          useValue: {
            createSubdireccion$: createSubdireccionFn,
            updateSubdireccion$: updateSubdireccionFn,
            deleteSubdireccion$: deleteSubdireccionFn,
          },
        },
        { provide: AuthCallerService, useValue: { currentCaller$: currentCallerObservable } },
        { provide: MessageService, useValue: { add: messageAddFn, messageObserver: EMPTY, clearObserver: EMPTY } },
        ConfirmationService,
      ],
    });

    confirmFn = vi.spyOn(TestBed.inject(ConfirmationService), 'confirm') as any;
  });

  it('should fetch the DIGEEX root and its subcommunities on init, exposing them in the component state', () => {
    const fixture = TestBed.createComponent(Communities);
    fixture.detectChanges();

    expect(searchTopFn).toHaveBeenCalled();
    expect(listSubcommunitiesFn).toHaveBeenCalledWith('digeex-root-uuid', 0, 10);
    expect(fixture.componentInstance.subdirecciones().map((c) => c.name)).toEqual([
      'Educación Básica',
      'Trabajo y Cultura',
      'Investigación',
    ]);
  });

  describe('canCreateTopLevel signal', () => {
    it('should be true when caller is superadmin', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      expect(fixture.componentInstance.canCreateTopLevel()).toBe(true);
    });

    it('should be false when caller is admin_subdireccion', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Communities],
        providers: [
          provideNoopAnimations(),
          provideRouter([]),
          {
            provide: CommunityApiService,
            useValue: { searchTop: searchTopFn, listSubcommunities: listSubcommunitiesFn },
          },
          {
            provide: CollectionApiService,
            useValue: { listByCommunity: listByCommunityFn },
          },
          {
            provide: DSpaceApiService,
            useValue: { getItems: getItemsFn },
          },
          { provide: CommunityFacade, useValue: {} },
          {
            provide: AuthCallerService,
            useValue: { currentCaller$: of({ role: 'admin_subdireccion', sufijo: 'ED_BASICA' }) },
          },
          { provide: MessageService, useValue: { add: vi.fn(), messageObserver: EMPTY, clearObserver: EMPTY } },
          ConfirmationService,
        ],
      });
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      expect(fixture.componentInstance.canCreateTopLevel()).toBe(false);
    });
  });

  describe('dialog flow', () => {
    it('should open the dialog in create mode when openCreateDialog is invoked', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openCreateDialog();

      expect(c.dialogMode()).toBe('create');
      expect(c.editTarget()).toBeNull();
    });

    it('should open the dialog in edit mode and remember the target subdirección', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = buildCommunity('Educación Básica', 'sub-1');

      c.openEditDialog(target);

      expect(c.dialogMode()).toBe('edit');
      expect(c.editTarget()?.uuid).toBe('sub-1');
    });

    it('should close the dialog returning mode to closed', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openCreateDialog();

      c.closeDialog();

      expect(c.dialogMode()).toBe('closed');
      expect(c.editTarget()).toBeNull();
    });
  });

  describe('mutations', () => {
    it('should call createSubdireccion$ with name=nombreCorto and dc.title.alternative+dc.title metadata, close the dialog, refresh and toast', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openCreateDialog();
      listSubcommunitiesFn.mockClear();

      c.handleCreateSubmit({
        nombreCorto: 'Nueva',
        tituloCompleto: 'Subdirección Nueva',
        sufijo: 'ED_NUEVA',
        description: '',
      });

      expect(createSubdireccionFn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nueva',
          type: 'community',
          metadata: expect.objectContaining({
            'dc.title': [expect.objectContaining({ value: 'Subdirección Nueva' })],
            'dc.title.alternative': [expect.objectContaining({ value: 'Nueva' })],
          }),
        }),
        'ED_NUEVA',
      );
      expect(c.dialogMode()).toBe('closed');
      expect(listSubcommunitiesFn).toHaveBeenCalledWith('digeex-root-uuid', 0, 10);
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
    });

    it('should call updateSubdireccion$ with a JsonPatch on dc.title (tituloCompleto) and the sufijo, close dialog, refresh and toast', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = buildCommunity('Educación Básica', 'sub-1');
      c.openEditDialog(target);
      listSubcommunitiesFn.mockClear();

      c.handleEditSubmit({
        nombreCorto: 'Educación Básica',
        tituloCompleto: 'Subdirección de Educación Básica Renombrada',
        sufijo: 'ED_BASICA',
        description: '',
      });

      expect(updateSubdireccionFn).toHaveBeenCalledWith(
        'sub-1',
        expect.arrayContaining([
          expect.objectContaining({
            op: 'replace',
            path: '/metadata/dc.title/0/value',
            value: 'Subdirección de Educación Básica Renombrada',
          }),
        ]),
        'ED_BASICA',
      );
      expect(c.dialogMode()).toBe('closed');
      expect(listSubcommunitiesFn).toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
    });

    it('should ask for confirmation, then call deleteSubdireccion$, refresh the list and toast on accept', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = buildCommunity('Educación Básica', 'sub-1');

      // Simular que el ConfirmationService invoca el accept callback inmediatamente.
      confirmFn.mockImplementation((options: { accept: () => void }) => options.accept());
      listSubcommunitiesFn.mockClear();

      c.handleDelete(target, 'ED_BASICA');

      expect(confirmFn).toHaveBeenCalled();
      expect(deleteSubdireccionFn).toHaveBeenCalledWith('sub-1', 'ED_BASICA');
      expect(listSubcommunitiesFn).toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
    });
  });
});
