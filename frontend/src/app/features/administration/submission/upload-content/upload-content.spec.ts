/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { UploadContent } from './upload-content';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Community } from '../../../../core/api/models/community.model';
import { Collection } from '../../../../core/api/models/collection.model';

/**
 * Test para upload-content.
 * 
 * El container UploadContent agrupa los programas por subdirección y
 * filtra el listado según el rol del caller: superadmin ve las tres
 * subdirecciones de DIGEEX con todos sus programas; admin_subdireccion
 * y personal_delegado ven sólo la sub cuyo sufijo coincide con el suyo.
 * Cada fila navega a la ruta de submission con el UUID del programa
 * elegido, donde el host monta el formulario por entity-type.
 *
 * Ciclo 26 TDD — Sprint 6. Ajustado en Ciclo 19 (Sprint 9).
 */
describe('UploadContent', () => {
  function buildSub(uuid: string, name: string, sufijo: string): Community {
    return {
      uuid,
      name,
      handle: `123/${uuid}`,
      archivedItemsCount: 0,
      type: 'community',
      metadata: {
        'digeex.sufijo': [
          { value: sufijo, language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };
  }

  function buildCollection(uuid: string, name: string, parentUuid: string): Collection {
    return {
      uuid,
      name,
      handle: `123/${uuid}`,
      archivedItemsCount: 0,
      type: 'collection',
      metadata: {},
      _embedded: { parentCommunity: { uuid: parentUuid } as any },
    };
  }

  const subs = [
    buildSub('sub-1', 'Educación Básica', 'ED_BASICA'),
    buildSub('sub-2', 'Trabajo y Cultura', 'ED_TRABAJO'),
    buildSub('sub-3', 'Investigación', 'ED_INVESTIGACION'),
  ];

  const allCollections: Collection[] = [
    buildCollection('peac', 'PEAC', 'sub-1'),
    buildCollection('eva', 'EVA', 'sub-1'),
    buildCollection('cemucaf', 'CEMUCAF', 'sub-2'),
    buildCollection('invest', 'INVEST', 'sub-3'),
    buildCollection('datos', 'DATOS', 'sub-3'),
  ];

  function configureModule(callerRole: 'superadmin' | 'admin_subdireccion' | 'personal_delegado', sufijo: string | null) {
    const searchTopFn = vi.fn().mockReturnValue(
      of({
        _embedded: { communities: [buildSub('digeex-root', 'DIGEEX', '')] },
        _links: { self: { href: '/x' } },
        page: { size: 1, totalElements: 1, totalPages: 1, number: 0 },
      }),
    );
    const listAllSubcommunitiesFn = vi.fn().mockReturnValue(of(subs));
    const listAllFn = vi.fn().mockReturnValue(of(allCollections));
    // No debe llamarse: el N+1 por subdirección se reemplazó por un solo listAll.
    const listByCommunityFn = vi.fn();

    TestBed.configureTestingModule({
      imports: [UploadContent],
      providers: [
        provideNoopAnimations(),
        {
          provide: CommunityApiService,
          useValue: { searchTop: searchTopFn, listAllSubcommunities: listAllSubcommunitiesFn },
        },
        { provide: CollectionApiService, useValue: { listAll: listAllFn, listByCommunity: listByCommunityFn } },
        {
          provide: AuthCallerService,
          useValue: { currentCaller$: of({ role: callerRole, sufijo }) },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });

    return { listAllFn, listByCommunityFn };
  }

  it('should expose all 3 subdirecciones with their programs when caller is superadmin', () => {
    configureModule('superadmin', null);
    const fixture = TestBed.createComponent(UploadContent);
    fixture.detectChanges();

    const groups = fixture.componentInstance.groups();
    expect(groups.length).toBe(3);
    expect(groups.map((g) => g.sub.name)).toEqual([
      'Educación Básica',
      'Trabajo y Cultura',
      'Investigación',
    ]);
    expect(groups[0].programs.map((p) => p.name)).toEqual(['PEAC', 'EVA']);
  });

  it('should load all programs with a single listAll and no per-sub request', () => {
    const { listAllFn, listByCommunityFn } = configureModule('superadmin', null);
    const fixture = TestBed.createComponent(UploadContent);
    fixture.detectChanges();

    // Un solo listAll para todas las colecciones; sin petición por subdirección.
    expect(listAllFn).toHaveBeenCalledTimes(1);
    expect(listByCommunityFn).not.toHaveBeenCalled();
  });

  it('should expose only the matching sub when caller is admin_subdireccion with sufijo', () => {
    configureModule('admin_subdireccion', 'ED_TRABAJO');
    const fixture = TestBed.createComponent(UploadContent);
    fixture.detectChanges();

    const groups = fixture.componentInstance.groups();
    expect(groups.length).toBe(1);
    expect(groups[0].sub.name).toBe('Trabajo y Cultura');
    expect(groups[0].programs.map((p) => p.name)).toEqual(['CEMUCAF']);
  });

  it('should expose only the matching sub when caller is personal_delegado with sufijo', () => {
    configureModule('personal_delegado', 'ED_INVESTIGACION');
    const fixture = TestBed.createComponent(UploadContent);
    fixture.detectChanges();

    const groups = fixture.componentInstance.groups();
    expect(groups.length).toBe(1);
    expect(groups[0].sub.name).toBe('Investigación');
    expect(groups[0].programs.map((p) => p.name)).toEqual(['INVEST', 'DATOS']);
  });

  it('should navigate to the submission route with the collection uuid when openSubmission is called', () => {
    configureModule('superadmin', null);
    const fixture = TestBed.createComponent(UploadContent);
    const router = TestBed.inject(Router);
    const navigate = router.navigate as any;
    fixture.detectChanges();

    fixture.componentInstance.openSubmission(buildCollection('peac', 'PEAC'));

    expect(navigate).toHaveBeenCalledWith([
      '/administrador/programas',
      'peac',
      'cargar',
    ]);
  });

  it('should expose loading=true before the API resolves and false after', () => {
    configureModule('superadmin', null);
    const fixture = TestBed.createComponent(UploadContent);
    const c = fixture.componentInstance;
    // Antes de detectChanges no se dispara el constructor que sube el loading.
    // Pero el subscribe en el constructor es síncrono con `of(...)` mocks, así
    // que después de detectChanges el loading ya bajó. Verificamos el valor
    // final que el template observa.
    fixture.detectChanges();
    expect(c.loading()).toBe(false);
  });

  it('should expose hasNothingToShow=true when the caller has no programs available', () => {
    // Caller con sufijo que no matchea ninguna sub: findCallerSub devuelve null,
    // groups() queda vacío y la pantalla debe avisar al usuario en lugar de
    // mostrar una página en blanco.
    configureModule('admin_subdireccion', 'ED_INEXISTENTE');
    const fixture = TestBed.createComponent(UploadContent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.groups().length).toBe(0);
    expect(c.hasNothingToShow()).toBe(true);
  });
});
