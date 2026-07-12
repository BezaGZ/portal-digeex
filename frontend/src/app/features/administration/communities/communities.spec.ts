/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EMPTY, NEVER, Observable, of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';

import { Communities } from './communities';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CommunityFacade } from '../content/services/community-facade';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { Community } from '../../../core/api/models/community.model';
import { Caller } from '../content/specifications/scope-context.model';
import { LoadingService } from '../../../core/loading/loading.service';

/**
 * Tests del contenedor Communities.
 *
 * El contenedor lista las subdirecciones (sub-comunidades top-level de
 * la community raíz DIGEEX), expone botones de crear/editar/eliminar
 * según el rol del caller y delega las mutaciones al CommunityFacade.
 * Asume que el bootstrap (setup-dspace.sh) corrió y la community raíz
 * existe; si no existe, muestra un mensaje de sistema no inicializado.
 *
 * La tabla se llena por página vía un `effect()` que observa `currentPage`,
 * `pageSize` y `refreshCounter`; `onLazyLoad` y las mutaciones son intent
 * puro (solo setean signals) y el `fixture.detectChanges()` después de
 * cada mutación hace correr el effect que dispara el fetch.
 *
 * Ciclo 17 TDD — Sprint 6. Ajustado en Ciclos 25, 38 y 47 (Sprint 8) Ciclo 20 (Sprint 9).
 */
describe('Communities (contenedor)', () => {
  let searchTopFn: ReturnType<typeof vi.fn>;
  let listSubcommunitiesFn: ReturnType<typeof vi.fn>;
  let listByCommunityFn: ReturnType<typeof vi.fn>;
  let getItemsFn: ReturnType<typeof vi.fn>;
  let listAllFn: ReturnType<typeof vi.fn>;
  let currentCallerObservable: Observable<Caller | null>;
  let createSubdireccionFn: ReturnType<typeof vi.fn>;
  let updateSubdireccionFn: ReturnType<typeof vi.fn>;
  let deleteSubdireccionFn: ReturnType<typeof vi.fn>;
  let searchFn: ReturnType<typeof vi.fn>;
  let messageAddFn: ReturnType<typeof vi.fn>;

  function buildCommunity(name: string, uuid: string, archived = 0): Community {
    return {
      uuid,
      name,
      handle: `123456789/${uuid}`,
      metadata: {},
      archivedItemsCount: archived,
      type: 'community',
    };
  }

  function buildColl(uuid: string, parentUuid: string): any {
    return {
      uuid,
      name: uuid,
      handle: `123456789/${uuid}`,
      metadata: {},
      archivedItemsCount: 0,
      type: 'collection',
      _embedded: { parentCommunity: { uuid: parentUuid } },
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
            buildCommunity('Educación Básica', 'sub-1', 9),
            buildCommunity('Trabajo y Cultura', 'sub-2', 0),
            buildCommunity('Investigación', 'sub-3', 46),
          ],
        },
        _links: { self: { href: '/server/api/core/communities/digeex-root-uuid/subcommunities' } },
        page: { size: 20, totalElements: 3, totalPages: 1, number: 0 },
      }),
    );
    // Una sola carga de colecciones con su comunidad padre: el conteo de
    // programas se agrupa de aquí, sin una petición por subdirección.
    listAllFn = vi.fn().mockReturnValue(
      of([
        buildColl('c1', 'sub-1'),
        buildColl('c2', 'sub-1'),
        buildColl('c3', 'sub-2'),
        buildColl('c4', 'sub-3'),
        buildColl('c5', 'sub-3'),
        buildColl('c6', 'sub-3'),
      ]),
    );
    // listByCommunity llena la lista de programas del diálogo de borrado (no el listado).
    // getItems queda como espía para verificar que ya no se invoca por subdirección.
    listByCommunityFn = vi.fn().mockReturnValue(
      of({
        _embedded: { collections: [buildColl('c1', 'sub-1'), buildColl('c2', 'sub-1')] },
        _links: { self: { href: '/' } },
        page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
      }),
    );
    getItemsFn = vi.fn();
    // Discovery acotado a la comunidad: conteo recursivo de recursos del subárbol.
    searchFn = vi.fn().mockReturnValue(
      of({ items: [], facets: [], totalElements: 57, totalPages: 3, page: 0, size: 0 }),
    );
    currentCallerObservable = of({ role: 'superadmin', scopeUuid: null });
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
          useValue: { listAll: listAllFn, listByCommunity: listByCommunityFn },
        },
        {
          provide: DSpaceApiService,
          useValue: { getItems: getItemsFn },
        },
        {
          provide: DiscoveryService,
          useValue: { search: searchFn },
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

  /**
   * Verifica que recursosCount salga del campo nativo archivedItemsCount y que
   * programasCount salga de un único listAll agrupado por comunidad padre, sin
   * una petición por subdirección (ni listByCommunity ni getItems).
   */
  it('should read recursosCount from archivedItemsCount and programasCount from a single listAll, without per-sub requests', () => {
    const fixture = TestBed.createComponent(Communities);
    fixture.detectChanges();

    const subs = fixture.componentInstance.subdirecciones();
    const eb = subs.find((s) => s.uuid === 'sub-1');
    const inv = subs.find((s) => s.uuid === 'sub-3');
    expect(eb?.recursosCount).toBe(9);
    expect(eb?.programasCount).toBe(2);
    expect(inv?.recursosCount).toBe(46);
    expect(inv?.programasCount).toBe(3);

    expect(listAllFn).toHaveBeenCalledTimes(1);
    expect(listByCommunityFn).not.toHaveBeenCalled();
    expect(getItemsFn).not.toHaveBeenCalled();
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
            useValue: { listAll: listAllFn, listByCommunity: listByCommunityFn },
          },
          {
            provide: DSpaceApiService,
            useValue: { getItems: getItemsFn },
          },
          {
            provide: DiscoveryService,
            useValue: { search: searchFn },
          },
          { provide: CommunityFacade, useValue: {} },
          {
            provide: AuthCallerService,
            useValue: { currentCaller$: of({ role: 'admin_subdireccion', scopeUuid: 'ED_BASICA' }) },
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
      fixture.detectChanges();

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

    it('should call updateSubdireccion$ with a JsonPatch on dc.title (tituloCompleto), close dialog, refresh and toast', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = buildCommunity('Educación Básica', 'sub-1');
      target.metadata = {
        'dc.title': [{ value: 'Subdirección de Educación Básica', language: null, authority: null, confidence: -1, place: 0 }],
      };
      c.openEditDialog(target);
      listSubcommunitiesFn.mockClear();

      c.handleEditSubmit({
        nombreCorto: 'Educación Básica',
        tituloCompleto: 'Subdirección de Educación Básica Renombrada',
        sufijo: 'ED_BASICA',
        description: '',
      });
      fixture.detectChanges();

      expect(updateSubdireccionFn).toHaveBeenCalledWith(
        'sub-1',
        expect.arrayContaining([
          expect.objectContaining({
            op: 'replace',
            path: '/metadata/dc.title/0/value',
            value: 'Subdirección de Educación Básica Renombrada',
          }),
        ]),
      );
      expect(c.dialogMode()).toBe('closed');
      expect(listSubcommunitiesFn).toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
    });

    /**
     * Verifica que la edición limpie los duplicados históricos de la descripción.
     * El add de DSpace anexa sobre campos existentes; el helper emite removes + replace.
     */
    it('should clean duplicated description values and never add over existing fields on edit', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = buildCommunity('Educación Básica', 'sub-1');
      target.metadata = {
        'dc.title': [{ value: 'Subdirección de Educación Básica', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.description': [
          { value: 'Dup', language: null, authority: null, confidence: -1, place: 0 },
          { value: 'Dup', language: null, authority: null, confidence: -1, place: 1 },
          { value: 'Dup', language: null, authority: null, confidence: -1, place: 2 },
        ],
      };
      c.openEditDialog(target);

      c.handleEditSubmit({
        nombreCorto: 'Educación Básica',
        tituloCompleto: 'Subdirección de Educación Básica',
        sufijo: 'ED_BASICA',
        description: 'Descripción editada',
      });

      expect(updateSubdireccionFn).toHaveBeenCalledWith(
        'sub-1',
        [
          { op: 'remove', path: '/metadata/dc.description/2' },
          { op: 'remove', path: '/metadata/dc.description/1' },
          { op: 'replace', path: '/metadata/dc.description/0/value', value: 'Descripción editada' },
        ],
      );
    });

    /** El borrado abre el diálogo peligroso y trae programas (conteo+títulos) + conteo recursivo de recursos. */
    it('should open the dangerous delete dialog with programs and recursive resource counts', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = buildCommunity('Educación Básica', 'sub-1');
      target.metadata = {
        'dc.title': [{ value: 'Subdirección de Educación Básica', language: null, authority: null, confidence: -1, place: 0 }],
      };

      c.onDeleteClick(target);

      expect(c.deleteVisible()).toBe(true);
      expect(c.deleteEntityLabel()).toBe('Subdirección de Educación Básica');
      expect(listByCommunityFn).toHaveBeenCalledWith('sub-1', 0, 20, {});
      expect(searchFn).toHaveBeenCalledWith({ scope: 'sub-1', dsoType: 'item', size: 0 });
      expect(c.deleteProgramsCount()).toBe(2);
      expect(c.deleteItemsCount()).toBe(57);
      expect(c.deleteTitles().length).toBe(2);
    });

    /** El texto a teclear para confirmar es el título completo (dc.title), no el nombre corto. */
    it('should use the full title (dc.title) as the confirmation label', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const target = buildCommunity('Educación Básica', 'sub-1');
      target.metadata = {
        'dc.title': [{ value: 'Subdirección de Educación Básica', language: null, authority: null, confidence: -1, place: 0 }],
        'dc.title.alternative': [{ value: 'Básica', language: null, authority: null, confidence: -1, place: 0 }],
      };

      c.onDeleteClick(target);

      expect(c.deleteEntityLabel()).toBe('Subdirección de Educación Básica');
    });

    it('should call deleteSubdireccion$, refresh the list and toast when the dialog confirms', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.onDeleteClick(buildCommunity('Educación Básica', 'sub-1'));
      listSubcommunitiesFn.mockClear();

      c.onDeleteConfirmed();
      fixture.detectChanges();

      expect(deleteSubdireccionFn).toHaveBeenCalledWith('sub-1');
      expect(listSubcommunitiesFn).toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
      expect(c.deleteVisible()).toBe(false);
    });

    /** Si el detalle falla, se marca el error sin bloquear el borrado. */
    it('should flag a load error but keep the dialog open when the detail fetch fails', () => {
      listByCommunityFn.mockReturnValueOnce(throwError(() => new Error('down')));
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.onDeleteClick(buildCommunity('Educación Básica', 'sub-1'));

      expect(c.deleteLoadError()).toBe(true);
      expect(c.deleteVisible()).toBe(true);
    });

    /** Verifica que crear una subdirección enrole una tarea de carga global mientras está en vuelo. */
    it('should enrol a loading task while creating a subdirección', () => {
      createSubdireccionFn.mockReturnValue(NEVER);
      const loading = TestBed.inject(LoadingService);
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      expect(loading.active()).toBe(false);
      c.handleCreateSubmit({ nombreCorto: 'A', tituloCompleto: 'Sub A', sufijo: 'ED_A', description: '' });
      expect(loading.active()).toBe(true);
    });
  });

  describe('refresh reactivo y guard del effect', () => {
    /** Verifica que el mount dispare una sola llamada a listSubcommunities aunque el effect corra al inicializar. */
    it('should fire a single fetch on mount even though the effect runs immediately', () => {
      listSubcommunitiesFn.mockClear();
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();

      expect(listSubcommunitiesFn).toHaveBeenCalledTimes(1);
      expect(listSubcommunitiesFn).toHaveBeenCalledWith('digeex-root-uuid', 0, 10);
    });

    /**
     * Verifica que dos mutaciones consecutivas disparen dos fetches separados.
     * Cada mutación incrementa el refreshCounter, lo cual cambia el trío de
     * dependencias del effect y obliga al guard a saltar el corto-circuito.
     */
    it('should fire a new fetch after each mutation (refreshCounter increments)', () => {
      const fixture = TestBed.createComponent(Communities);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openCreateDialog();
      listSubcommunitiesFn.mockClear();

      c.handleCreateSubmit({
        nombreCorto: 'A',
        tituloCompleto: 'Sub A',
        sufijo: 'ED_A',
        description: '',
      });
      fixture.detectChanges();
      c.handleCreateSubmit({
        nombreCorto: 'B',
        tituloCompleto: 'Sub B',
        sufijo: 'ED_B',
        description: '',
      });
      fixture.detectChanges();

      expect(listSubcommunitiesFn).toHaveBeenCalledTimes(2);
    });
  });
});
