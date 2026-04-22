/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { ChangeRoleDialog } from './change-role-dialog';
import { DSpaceApiService } from '../../../../../core/api/dspace-api.service';
import { UserView } from '../../models/user-view.model';
import { Community } from '../../../../../core/api/models/community.model';
import { Collection } from '../../../../../core/api/models/collection.model';
import { HalListResponse } from '../../../../../core/api/models/hal.model';

/**
 * Tests del ChangeRoleDialog.
 *
 * El diálogo recibe al target por input y reusa ScopeSelector. Cuando el
 * target ya tiene un rol válido, el form arranca sembrado con ese rol;
 * cuando el target es huérfano (role='sin_asignar') el dropdown no
 * incluye esa opción, así que el form se queda con el default
 * ('personal_delegado') y el operador elige qué rol asignarle.
 *
 * Patch del Ciclo 12 — visibilidad de huérfanos. Sprint 5.
 */
describe('ChangeRoleDialog', () => {
  let fixture: ComponentFixture<ChangeRoleDialog>;
  let component: ChangeRoleDialog;
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
      uuid: 'uuid-target',
      email: 'target@mineduc.gob.gt',
      firstName: 'Target',
      lastName: 'User',
      role: 'admin_subdireccion',
      subdivision: 'Educación Básica',
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
        ]),
      ),
    );
    getCollectionsFn = vi.fn().mockReturnValue(of(buildCollectionList([])));

    TestBed.configureTestingModule({
      imports: [ChangeRoleDialog],
      providers: [
        provideNoopAnimations(),
        {
          provide: DSpaceApiService,
          useValue: { getCommunities: getCommunitiesFn, getCollections: getCollectionsFn },
        },
      ],
    });

    fixture = TestBed.createComponent(ChangeRoleDialog);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', true);
  });

  /**
   * Comportamiento normal: cuando el target trae un rol válido el form se
   * siembra con ese rol para que el operador solo cambie lo que quiera.
   */
  it('should seed the role form with the target role when the target has a valid role', () => {
    fixture.componentRef.setInput(
      'target',
      buildUserView({ role: 'admin_subdireccion', subdivision: 'Educación Básica' }),
    );
    fixture.detectChanges();

    expect(component.form.value.role).toBe('admin_subdireccion');
  });

  /**
   * Caso huérfano: el target tiene role='sin_asignar' (porque alguien le
   * quitó el grupo en DSpace). El dropdown no expone esa opción, así que
   * sembrar el form con 'sin_asignar' dejaría el select en blanco. Mejor
   * dejar el default ('personal_delegado') para que el operador pueda
   * elegir un rol válido sin tocar nada extra.
   */
  it('should keep the default role when the target is an orphan (sin_asignar)', () => {
    fixture.componentRef.setInput(
      'target',
      buildUserView({ role: 'sin_asignar', subdivision: null }),
    );
    fixture.detectChanges();

    expect(component.form.value.role).toBe('personal_delegado');
  });
});
