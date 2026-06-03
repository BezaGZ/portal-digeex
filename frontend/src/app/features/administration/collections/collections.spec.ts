/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { EMPTY, of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';

import { Collections } from './collections';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { CollectionFacade } from '../content/services/collection-facade';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { Community } from '../../../core/api/models/community.model';
import { Collection } from '../../../core/api/models/collection.model';

/**
 * Tests del contenedor Collections (pantalla "Programas").
 *
 * El contenedor lista las colecciones (programas) de la subdirección
 * seleccionada por el usuario en un dropdown server-side paginado. El
 * dropdown de subdirecciones se llena con `listAllSubcommunities` (todas
 * de un golpe vía paginación recursiva, porque el p-select debe poder
 * mostrarlas) y la tabla de colecciones se llena por página vía
 * `onLazyLoad` del `p-table`. SuperAdmin ve todas las subdirecciones;
 * admin_subdireccion queda bloqueado en su sufijo. Cada acción mutativa
 * delega al CollectionFacade existente.
 *
 * Ciclo 18 TDD — Sprint 6. Ajustado en Ciclo 4 (Sprint 7), Ciclo 12 y Ciclo 13 (Sprint 8).
 */
describe('Collections (contenedor)', () => {
  let searchTopFn: ReturnType<typeof vi.fn>;
  let listAllSubcommunitiesFn: ReturnType<typeof vi.fn>;
  let listByCommunityFn: ReturnType<typeof vi.fn>;
  let createColeccionFn: ReturnType<typeof vi.fn>;
  let updateColeccionFn: ReturnType<typeof vi.fn>;
  let deleteColeccionFn: ReturnType<typeof vi.fn>;
  let replaceLogoFn: ReturnType<typeof vi.fn>;
  let confirmFn: ReturnType<typeof vi.fn>;
  let messageAddFn: ReturnType<typeof vi.fn>;

  function buildCollection(name: string, uuid: string, archivedItemsCount = 0): Collection {
    return {
      uuid,
      name,
      handle: `123456789/${uuid}`,
      metadata: {},
      archivedItemsCount,
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

  function buildPage(colls: Collection[], totalElements: number) {
    return of({
      _embedded: { collections: colls },
      _links: { self: { href: '/' } },
      page: {
        size: 10,
        totalElements,
        totalPages: Math.ceil(totalElements / 10),
        number: 0,
      },
    });
  }

  beforeEach(() => {
    searchTopFn = vi.fn().mockReturnValue(
      of({
        _embedded: { communities: [buildCommunity('DIGEEX', 'digeex-root-uuid', '')] },
        _links: { self: { href: '/server/api/core/communities/search/top' } },
        page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
      }),
    );
    listAllSubcommunitiesFn = vi.fn().mockReturnValue(
      of([
        buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA'),
        buildCommunity('Trabajo y Cultura', 'sub-2', 'ED_TRABAJO'),
        buildCommunity('Investigación', 'sub-3', 'ED_INVESTIGACION'),
      ]),
    );
    listByCommunityFn = vi
      .fn()
      .mockReturnValue(buildPage([buildCollection('PEAC', 'coll-peac', 34), buildCollection('PRONEA', 'coll-pronea', 6)], 2));
    createColeccionFn = vi.fn().mockReturnValue(of(buildCollection('Nueva', 'coll-new')));
    updateColeccionFn = vi.fn().mockReturnValue(of(buildCollection('Renombrada', 'coll-peac')));
    deleteColeccionFn = vi.fn().mockReturnValue(of(undefined));
    replaceLogoFn = vi.fn().mockReturnValue(of({ uuid: 'logo-bs' }));
    messageAddFn = vi.fn();

    TestBed.configureTestingModule({
      imports: [Collections],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        {
          provide: CommunityApiService,
          useValue: { searchTop: searchTopFn, listAllSubcommunities: listAllSubcommunitiesFn },
        },
        {
          provide: CollectionApiService,
          useValue: { listByCommunity: listByCommunityFn },
        },
        {
          provide: CollectionFacade,
          useValue: {
            createColeccion$: createColeccionFn,
            updateColeccion$: updateColeccionFn,
            deleteColeccion$: deleteColeccionFn,
            replaceLogo$: replaceLogoFn,
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

  /** Verifica que en init se llene el dropdown con listAllSubcommunities (paginación recursiva). */
  it('should fetch DIGEEX root and all subdirecciones on init via listAllSubcommunities', () => {
    const fixture = TestBed.createComponent(Collections);
    fixture.detectChanges();

    expect(searchTopFn).toHaveBeenCalled();
    expect(listAllSubcommunitiesFn).toHaveBeenCalledWith('digeex-root-uuid');
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
          provideHttpClient(),
          {
            provide: CommunityApiService,
            useValue: { searchTop: searchTopFn, listAllSubcommunities: listAllSubcommunitiesFn },
          },
          {
            provide: CollectionApiService,
            useValue: { listByCommunity: vi.fn().mockReturnValue(buildPage([], 0)) },
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

  describe('auto-selection of caller sub', () => {
    it('should NOT auto-select any sub when caller is superadmin (chooses freely)', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      expect(fixture.componentInstance.selectedSubdireccion()).toBeNull();
    });

    it('should auto-select the matching sub when caller is admin_subdireccion with sufijo', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Collections],
        providers: [
          provideNoopAnimations(),
          provideHttpClient(),
          {
            provide: CommunityApiService,
            useValue: { searchTop: searchTopFn, listAllSubcommunities: listAllSubcommunitiesFn },
          },
          {
            provide: CollectionApiService,
            useValue: { listByCommunity: vi.fn().mockReturnValue(buildPage([], 0)) },
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
      expect(fixture.componentInstance.selectedSubdireccion()?.uuid).toBe('sub-1');
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

  describe('selecting a subdireccion (server-side pagination)', () => {
    /** Verifica que selectSubdireccion guarde el sub y resetee currentPage sin disparar fetch. */
    it('should store the selected sub and reset currentPage without fetching collections', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      listByCommunityFn.mockClear();

      c.selectSubdireccion(sub);

      expect(c.selectedSubdireccion()?.uuid).toBe('sub-1');
      expect(c.currentPage()).toBe(0);
      expect(listByCommunityFn).not.toHaveBeenCalled();
    });

    /** Verifica que onLazyLoad con first=0/rows=10 dispare listByCommunity con page=0/size=10 y embed=logo. */
    it('should dispatch listByCommunity with page=0/size=10 when onLazyLoad fires for the first page', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      listByCommunityFn.mockClear();

      c.onLazyLoad({ first: 0, rows: 10 });

      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 0, 10, { embed: 'logo' });
      expect(c.collections().map((coll) => coll.name)).toEqual(['PEAC', 'PRONEA']);
    });

    /** Verifica que onLazyLoad con first=10/rows=10 traduzca el offset a page=1. */
    it('should translate first/rows to the correct page index when onLazyLoad fires for page 2', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      listByCommunityFn.mockClear();

      c.onLazyLoad({ first: 10, rows: 10 });

      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 1, 10, { embed: 'logo' });
    });

    /** Verifica que totalRecords se actualice desde page.totalElements del response. */
    it('should update totalRecords signal from page.totalElements after fetch', () => {
      listByCommunityFn.mockReturnValue(
        buildPage([buildCollection('A', 'a'), buildCollection('B', 'b')], 47),
      );
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);

      c.onLazyLoad({ first: 0, rows: 10 });

      expect(c.totalRecords()).toBe(47);
    });

    /**
     * Verifica que `recursosCount` se derive del `archivedItemsCount`
     * que viaja en el listing cuando `webui.strengths.show=true`.
     */
    it('should derive recursosCount from archivedItemsCount in the listing', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);

      c.onLazyLoad({ first: 0, rows: 10 });

      const counts = c.collections().map((coll) => coll.recursosCount);
      expect(counts).toEqual([34, 6]);
    });

    /**
     * Verifica el clamp defensivo: si DSpace devuelve `-1` (feature strengths
     * off), el widget muestra 0 en la tabla, no un número negativo.
     */
    it('should clamp a negative archivedItemsCount to 0 in recursosCount', () => {
      listByCommunityFn.mockReturnValue(
        buildPage([buildCollection('SIN_CONTEO', 'coll-x', -1)], 1),
      );

      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      c.onLazyLoad({ first: 0, rows: 10 });

      expect(c.collections()[0].recursosCount).toBe(0);
    });
  });

  describe('mutations', () => {
    it('should call createColeccion$ with parentUuid + body con metadata DIGEEX + sufijo derivado, refresh y toast', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      c.onLazyLoad({ first: 0, rows: 10 });
      listByCommunityFn.mockClear();

      c.handleCreateSubmit({
        siglas: 'NUEVO',
        titulo: 'Nuevo programa',
        description: '',
        entityType: 'Documento',
        navLocation: 'menu-principal',
        orden: '5',
        coverFile: null,
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
        undefined,
      );
      expect(c.dialogMode()).toBe('closed');
      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 0, 10, { embed: 'logo' });
      expect(messageAddFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    });

    it('should call updateColeccion$ with patch sobre dc.title y digeex.navLocation, no toca dspace.entity.type, refresh y toast', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      c.onLazyLoad({ first: 0, rows: 10 });
      const target = buildCollection('PEAC', 'coll-peac');
      c.openEditDialog(target);

      c.handleEditSubmit({
        siglas: 'PEAC',
        titulo: 'Programa de Educación de Adultos por Correspondencia (renombrado)',
        description: '',
        entityType: 'Documento',
        navLocation: 'menu-secundario',
        orden: '1',
        coverFile: null,
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

    /** Verifica que al crear con cover el facade reciba el File en el cuarto argumento. */
    it('should forward coverFile to createColeccion$ when present in the payload', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      c.onLazyLoad({ first: 0, rows: 10 });
      const cover = new File(['png'], 'logo.png', { type: 'image/png' });

      c.handleCreateSubmit({
        siglas: 'NUEVO',
        titulo: 'Nuevo programa',
        description: '',
        entityType: 'Documento',
        navLocation: 'menu-principal',
        orden: '5',
        coverFile: cover,
      });

      expect(createColeccionFn).toHaveBeenCalledWith(
        'sub-1',
        expect.any(Object),
        'ED_BASICA',
        cover,
      );
    });

    /**
     * Verifica que en edit con cover el facade reciba el patch y replaceLogo$ se encadene después.
     * El patch de metadata ya quedó aplicado aunque falle el logo; por eso el toast es de éxito completo solo si ambos pasos van bien.
     */
    it('should chain replaceLogo$ after updateColeccion$ when coverFile is present in edit', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      c.onLazyLoad({ first: 0, rows: 10 });
      const target = buildCollection('PEAC', 'coll-peac');
      c.openEditDialog(target);
      const cover = new File(['png'], 'logo.png', { type: 'image/png' });

      c.handleEditSubmit({
        siglas: 'PEAC',
        titulo: 'PEAC (renombrado)',
        description: '',
        entityType: 'Documento',
        navLocation: 'menu-principal',
        orden: '1',
        coverFile: cover,
      });

      expect(updateColeccionFn).toHaveBeenCalled();
      expect(replaceLogoFn).toHaveBeenCalledWith('coll-peac', cover, 'ED_BASICA');
      const updateOrder = updateColeccionFn.mock.invocationCallOrder[0];
      const replaceOrder = replaceLogoFn.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(replaceOrder);
    });

    it('should ask for confirmation, then call deleteColeccion$, refresh y toast on accept', () => {
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      c.onLazyLoad({ first: 0, rows: 10 });
      const target = buildCollection('PEAC', 'coll-peac');

      confirmFn.mockImplementation((options: { accept: () => void }) => options.accept());
      listByCommunityFn.mockClear();

      c.onDeleteClick(target);

      expect(confirmFn).toHaveBeenCalled();
      expect(deleteColeccionFn).toHaveBeenCalledWith('coll-peac', 'ED_BASICA');
      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 0, 10, { embed: 'logo' });
      expect(messageAddFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    });

    /**
     * Verifica la política de refresh sin huérfanos: tras eliminar la última fila
     * de la página actual, currentPage baja a la página previa para evitar mostrar
     * una página vacía al usuario.
     */
    it('should drop currentPage to previous page when the current page becomes empty after delete', () => {
      // Setup: usuario está en página 2 (currentPage=1) viendo 1 colección, total era 11.
      listByCommunityFn.mockReturnValueOnce(
        buildPage([buildCollection('LAST', 'coll-last', 0)], 11),
      );
      const fixture = TestBed.createComponent(Collections);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const sub = buildCommunity('Educación Básica', 'sub-1', 'ED_BASICA');
      c.selectSubdireccion(sub);
      c.onLazyLoad({ first: 10, rows: 10 });
      expect(c.currentPage()).toBe(1);

      // Tras eliminar la última colección, el siguiente fetch devuelve la página vacía con total=10.
      listByCommunityFn.mockReturnValueOnce(buildPage([], 10)); // página 1 ahora vacía
      listByCommunityFn.mockReturnValueOnce(
        buildPage([buildCollection('PEAC', 'coll-peac', 34)], 10),
      ); // página 0 con datos
      listByCommunityFn.mockClear();
      confirmFn.mockImplementation((options: { accept: () => void }) => options.accept());

      c.onDeleteClick(buildCollection('LAST', 'coll-last'));

      expect(c.currentPage()).toBe(0);
    });
  });
});
