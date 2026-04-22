/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { outputToObservable } from '@angular/core/rxjs-interop';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { UserDialog } from './user-dialog';
import { DSpaceApiService } from '../../../../../core/api/dspace-api.service';
import { UserView } from '../../models/user-view.model';
import { Community } from '../../../../../core/api/models/community.model';
import { Collection } from '../../../../../core/api/models/collection.model';
import { HalListResponse } from '../../../../../core/api/models/hal.model';

/**
 * Tests del componente UserDialog.
 *
 * El diálogo recibe al caller por input y delega la elección de
 * subdirección/colecciones al subcomponente ScopeSelector. Cuando el
 * caller es admin_subdireccion, el selector de rol queda fijo en
 * personal_delegado y la subdivisión se preselecciona con la community
 * del propio caller.
 *
 * Ciclo 12 — Sprint 5.
 */
describe('UserDialog', () => {
  let fixture: ComponentFixture<UserDialog>;
  let component: UserDialog;
  let getCommunitiesFn: ReturnType<typeof vi.fn>;
  let getCollectionsFn: ReturnType<typeof vi.fn>;

  function buildCommunity(uuid: string, name: string): Community {
    return {
      uuid,
      name,
      handle: `123/${uuid}`,
      metadata: {},
      archivedItemsCount: 0,
      type: 'community',
    };
  }

  function buildCommunityList(items: Community[]): HalListResponse<Community> {
    return {
      _embedded: { communities: items },
      _links: { self: { href: '/server/api/core/communities' } },
      page: { size: items.length, totalElements: items.length, totalPages: 1, number: 0 },
    };
  }

  function buildCollectionList(items: Collection[]): HalListResponse<Collection> {
    return {
      _embedded: { collections: items },
      _links: { self: { href: '/server/api/core/communities/x/collections' } },
      page: { size: items.length, totalElements: items.length, totalPages: 1, number: 0 },
    };
  }

  function buildUserView(overrides: Partial<UserView> = {}): UserView {
    return {
      uuid: 'uuid-caller',
      email: 'caller@mineduc.gob.gt',
      firstName: 'Caller',
      lastName: 'Admin',
      role: 'superadmin',
      subdivision: null,
      status: 'active',
      lastActive: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    getCommunitiesFn = vi.fn().mockReturnValue(
      of(
        buildCommunityList([
          buildCommunity('community-eb', 'Educación Básica'),
          buildCommunity('community-tc', 'Educación para el Trabajo y la Cultura'),
          buildCommunity('community-ipe', 'Investigación y Proyectos Educativos'),
        ]),
      ),
    );
    getCollectionsFn = vi.fn().mockReturnValue(of(buildCollectionList([])));

    TestBed.configureTestingModule({
      imports: [UserDialog],
      providers: [
        provideNoopAnimations(),
        {
          provide: DSpaceApiService,
          useValue: { getCommunities: getCommunitiesFn, getCollections: getCollectionsFn },
        },
      ],
    });

    fixture = TestBed.createComponent(UserDialog);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('caller', buildUserView());
  });

  /** Acceso al componente como any para leer signals y outputs sin pelear con tipos. */
  function asAny(value: unknown): any {
    return value as any;
  }

  /**
   * El UserDialog pide getCommunities al renderizar para resolver el uuid
   * inicial cuando el caller es admin_subdireccion. La lista plana de
   * opciones la consume directamente el ScopeSelector.
   */
  it('should request getCommunities() on init to resolve the caller subdivision uuid', () => {
    fixture.detectChanges();

    expect(getCommunitiesFn).toHaveBeenCalled();
  });

  /**
   * Caller superadmin: el selector de rol incluye los tres roles y no
   * está deshabilitado. Lo dejamos chiquito (solo verifica el flag de
   * disabled) porque la lista de roles ya la cubre el facade en su spec.
   */
  it('should NOT disable the role selector when caller is superadmin', () => {
    fixture.componentRef.setInput('caller', buildUserView({ role: 'superadmin' }));
    fixture.detectChanges();

    expect(asAny(component).roleSelectorDisabled()).toBe(false);
  });

  /** Decisión A del Ciclo 12: el rol queda visible pero deshabilitado. */
  it('should disable the role selector when caller is admin_subdireccion', () => {
    fixture.componentRef.setInput(
      'caller',
      buildUserView({
        uuid: 'uuid-admin-eb',
        role: 'admin_subdireccion',
        subdivision: 'Educación Básica',
      }),
    );
    fixture.detectChanges();

    expect(asAny(component).roleSelectorDisabled()).toBe(true);
  });

  /**
   * Cuando el caller es admin_subdireccion, el formulario arranca con
   * personal_delegado fijo en role. La subdivisión la maneja el
   * ScopeSelector vía scopeInitialSubdivisionUuid, que resuelve el uuid
   * a partir del nombre de subdivisión del caller.
   */
  it('should preselect personal_delegado and resolve the caller community uuid when caller is admin_subdireccion', () => {
    fixture.componentRef.setInput(
      'caller',
      buildUserView({
        uuid: 'uuid-admin-eb',
        role: 'admin_subdireccion',
        subdivision: 'Educación Básica',
      }),
    );
    fixture.detectChanges();

    expect(component.form.value.role).toBe('personal_delegado');
    expect(asAny(component).scopeInitialSubdivisionUuid()).toBe('community-eb');
    expect(asAny(component).scopeDisabledSubdivision()).toBe(true);
  });

  /**
   * El submit emite el input listo para mandárselo al facade. El scope
   * se simula vía onScopeChange porque en runtime es el ScopeSelector
   * quien lo emite; en el test tomamos su lugar.
   */
  it('should emit createSubmitted with the form value when the form is valid and submitted', () => {
    fixture.detectChanges();

    component.form.patchValue({
      email: 'nuevo@mineduc.gob.gt',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      role: 'personal_delegado',
    } as any);
    component.onScopeChange({
      subdivisionCommunityUuid: 'community-eb',
      collectionUuids: ['collection-peac'],
      valid: true,
    });

    const emitted: any[] = [];
    outputToObservable(component.createSubmitted).subscribe((value) => emitted.push(value));

    component.onSubmit();

    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        email: 'nuevo@mineduc.gob.gt',
        firstName: 'Nuevo',
        lastName: 'Usuario',
        role: 'personal_delegado',
        subdivisionCommunityUuid: 'community-eb',
        collectionUuids: ['collection-peac'],
      }),
    );
  });
});
