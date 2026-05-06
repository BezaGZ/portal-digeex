/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { EMPTY, of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';

import { Collections } from './collections';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CollectionFacade } from '../content/services/collection-facade';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { Community } from '../../../core/api/models/community.model';
import { Collection } from '../../../core/api/models/collection.model';

/**
 * Tests del contenedor Collections (pantalla "Programas").
 *
 * El contenedor lista las colecciones (programas) de la subdirección
 * seleccionada por el usuario en un dropdown. SuperAdmin ve todas las
 * subdirecciones; admin_subdireccion solo la suya y queda bloqueado en
 * ese sufijo. Cada acción mutativa delega al CollectionFacade existente.
 *
 * Ciclo 18 TDD — Sprint 6
 */
describe('Collections (contenedor)', () => {
  let searchTopFn: ReturnType<typeof vi.fn>;
  let listSubcommunitiesFn: ReturnType<typeof vi.fn>;
  let listByCommunityFn: ReturnType<typeof vi.fn>;
  let getItemsFn: ReturnType<typeof vi.fn>;
  let createColeccionFn: ReturnType<typeof vi.fn>;
  let updateColeccionFn: ReturnType<typeof vi.fn>;
  let deleteColeccionFn: ReturnType<typeof vi.fn>;
  let confirmFn: ReturnType<typeof vi.fn>;
  let messageAddFn: ReturnType<typeof vi.fn>;

  function buildCollection(name: string, uuid: string): Collection {
    return {
      uuid,
      name,
      handle: `123456789/${uuid}`,
      metadata: {},
      archivedItemsCount: 0,
      type: 'collection',
    };
  }

  function buildCommunity(name: string, uuid: string, sufijo: string): Community {
    return {
      uuid,
      name,
      handle: `123456789/${uuid}`,
      archivedItemsCount: 0,
      type: 'community',
      metadata: {
        'digeex.sufijo': [
          { value: sufijo, language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };
  }

  beforeEach(() => {
    searchTopFn = vi.fn().mockReturnValue(
      of({
        _embedded: { communities: [buildCommunity('DIGEEX', 'digeex-root-uuid', '')] },
        _links: { self: { href: '/server/api/core/communities/search/top' } },
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
      }),
    );
    listSubcommunitiesFn = vi.fn().mockReturnValue(
      of({
        _embedded: {
          subcommunities: [
            buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA'),
            buildCommunity('Trabajo y Cultura', 'sub-2', 'ED_TRABAJO'),
            buildCommunity('Investigación', 'sub-3', 'ED_INVESTIGACION'),
          ],
        },
        _links: { self: { href: '/server/api/core/communities/digeex-root-uuid/subcommunities' } },
        page: { size: 20, totalElements: 3, totalPages: 1, number: 0 },
      }),
    );
    listByCommunityFn = vi.fn().mockImplementation((uuid: string) =>
      of({
        _embedded: {
          collections: [
            buildCollection('PEAC', 'coll-peac'),
            buildCollection('PRONEA', 'coll-pronea'),
          ],
        },
        _links: { self: { href: `/server/api/core/communities/${uuid}/collections` } },
        page: { size: 10, totalElements: 2, totalPages: 1, number: 0 },
      }),
    );
    getItemsFn = vi.fn().mockImplementation((uuid: string) =>
      of({
        _embedded: { items: [] },
        _links: { self: { href: `/server/api/discover/search/objects?scope=${uuid}` } },
        page: { size: 1, totalElements: 0, totalPages: 0, number: 0 },
      }),
    );
    createColeccionFn = vi.fn().mockReturnValue(of(buildCollection('Nueva', 'coll-new')));
    updateColeccionFn = vi.fn().mockReturnValue(of(buildCollection('Renombrada', 'coll-peac')));
    deleteColeccionFn = vi.fn().mockReturnValue(of(undefined));
    messageAddFn = vi.fn();

    TestBed.configureTestingModule({
      imports: [Collections],
      providers: [
        provideNoopAnimations(),
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
        {
          provide: CollectionFacade,
          useValue: {
            createColeccion$: createColeccionFn,
            updateColeccion$: updateColeccionFn,
            deleteColeccion$: deleteColeccionFn,
          },
        },
        {
          provide: AuthCallerService,
          useValue: { currentCaller$: of({ role: 'superadmin', sufijo: null }) },
        },
        { provide: MessageService, useValue: { add: messageAddFn, messageObserver: EMPTY, clearObserver: EMPTY } },
        ConfirmationService,
      ],
    });

    confirmFn = vi.spyOn(TestBed.inject(ConfirmationService), 'confirm') as any;
  });

  it('should fetch DIGEEX root and its subdirecciones on init, exposing them as selector options', () => {
    const fixture = TestBed.createComponent(Collections);
    fixture.detectChanges();

    expect(searchTopFn).toHaveBeenCalled();
    expect(listSubcommunitiesFn).toHaveBeenCalledWith('digeex-root-uuid', 0, 100);
    expect(fixture.componentInstance.subdirecciones().map((s) => s.name)).toEqual([
      'Educación Básica',
      'Trabajo y Cultura',
      'Investigación',
    ]);
  });

  describe('canChooseAnySubdireccion signal', () => {
    it('should be true when caller is superadmin', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      expect(fixture.componentInstance.canChooseAnySubdireccion()).toBe(true);
    });

    it('should be false when caller is admin_subdireccion', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Collections],
        providers: [
          provideNoopAnimations(),
          {
            provide: CommunityApiService,
            useValue: { searchTop: searchTopFn, listSubcommunities: listSubcommunitiesFn },
          },
          {
            provide: CollectionApiService,
            useValue: { listByCommunity: vi.fn(() => of({ _embedded: { collections: [] }, _links: { self: { href: '/' } }, page: { size: 10, totalElements: 0, totalPages: 0, number: 0 } })) },
          },
          {
            provide: DSpaceApiService,
            useValue: { getItems: vi.fn(() => of({ _embedded: { items: [] }, _links: { self: { href: '/' } }, page: { size: 1, totalElements: 0, totalPages: 0, number: 0 } })) },
          },
          { provide: CollectionFacade, useValue: {} },
          {
            provide: AuthCallerService,
            useValue: { currentCaller$: of({ role: 'admin_subdireccion', sufijo: 'ED_BASICA' }) },
          },
          { provide: MessageService, useValue: { add: vi.fn(), messageObserver: EMPTY, clearObserver: EMPTY } },
          ConfirmationService,
        ],
      });
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      expect(fixture.componentInstance.canChooseAnySubdireccion()).toBe(false);
    });
  });

  describe('dialog flow', () => {
    it('should open the dialog in create mode when openCreateDialog is invoked', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openCreateDialog();
      expect(c.dialogMode()).toBe('create');
      expect(c.editTarget()).toBeNull();
    });

    it('should open the dialog in edit mode and remember the target collection', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = {
        uuid: 'coll-1',
        name: 'PEAC',
        handle: '123/200',
        metadata: {},
        archivedItemsCount: 0,
        type: 'collection',
      };
      c.openEditDialog(target);
      expect(c.dialogMode()).toBe('edit');
      expect(c.editTarget()?.uuid).toBe('coll-1');
    });

    it('should close the dialog returning mode to closed', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openCreateDialog();
      c.closeDialog();
      expect(c.dialogMode()).toBe('closed');
      expect(c.editTarget()).toBeNull();
    });
  });

  describe('selecting a subdireccion', () => {
    it('should fetch the collections of the selected subdireccion and expose them in state', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');

      c.selectSubdireccion(sub);

      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 0, 100);
      expect(c.collections().map((coll) => coll.name)).toEqual(['PEAC', 'PRONEA']);
      expect(c.selectedSubdireccion()?.uuid).toBe('sub-1');
    });
  });

  describe('mutations', () => {
    it('should call createColeccion$ with parentUuid + body con metadata DIGEEX + sufijo derivado, refresh y toast', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      listByCommunityFn.mockClear();

      c.handleCreateSubmit({
        siglas: 'NUEVO',
        titulo: 'Nuevo programa',
        description: '',
        entityType: 'Documento',
        navLocation: 'menu-principal',
        orden: '5',
      });

      expect(createColeccionFn).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({
          name: 'NUEVO',
          type: 'collection',
          metadata: expect.objectContaining({
            'dc.title': expect.arrayContaining([
              expect.objectContaining({ value: 'Nuevo programa' }),
            ]),
            'dc.title.alternative': expect.arrayContaining([
              expect.objectContaining({ value: 'NUEVO' }),
            ]),
            'dspace.entity.type': expect.arrayContaining([
              expect.objectContaining({ value: 'Documento' }),
            ]),
            'digeex.navLocation': expect.arrayContaining([
              expect.objectContaining({ value: 'menu-principal' }),
            ]),
          }),
        }),
        'ED_BASICA',
      );
      expect(c.dialogMode()).toBe('closed');
      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 0, 100);
      expect(messageAddFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    });

    it('should call updateColeccion$ with patch sobre dc.title y digeex.navLocation, no toca dspace.entity.type, refresh y toast', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      const target = buildCollection('PEAC', 'coll-peac');
      c.openEditDialog(target);

      c.handleEditSubmit({
        siglas: 'PEAC',
        titulo: 'Programa de Educación de Adultos por Correspondencia (renombrado)',
        description: '',
        entityType: 'Documento',
        navLocation: 'menu-secundario',
        orden: '1',
      });

      expect(updateColeccionFn).toHaveBeenCalledWith(
        'coll-peac',
        expect.arrayContaining([
          expect.objectContaining({
            op: 'replace',
            path: '/metadata/dc.title/0/value',
            value: 'Programa de Educación de Adultos por Correspondencia (renombrado)',
          }),
          expect.objectContaining({
            op: 'add',
            path: '/metadata/digeex.navLocation',
          }),
        ]),
        'ED_BASICA',
      );
      // El entityType es inmutable: nunca debe ir un patch sobre dspace.entity.type.
      const patch = updateColeccionFn.mock.calls[0][1] as Array<{ path: string }>;
      expect(patch.some((op) => op.path.startsWith('/metadata/dspace.entity.type'))).toBe(false);
      expect(c.dialogMode()).toBe('closed');
    });

    it('should ask for confirmation, then call deleteColeccion$, refresh y toast on accept', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      const target = buildCollection('PEAC', 'coll-peac');

      confirmFn.mockImplementation((options: { accept: () => void }) => options.accept());
      listByCommunityFn.mockClear();

      c.onDeleteClick(target);

      expect(confirmFn).toHaveBeenCalled();
      expect(deleteColeccionFn).toHaveBeenCalledWith('coll-peac', 'ED_BASICA');
      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 0, 100);
      expect(messageAddFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    });
  });
});
