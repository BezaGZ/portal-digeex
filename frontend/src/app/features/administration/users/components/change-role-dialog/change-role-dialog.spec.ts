/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { outputToObservable } from '@angular/core/rxjs-interop';
import { vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';

import { ChangeRoleDialog } from './change-role-dialog';
import { UserManagementService } from '../../services/user-management.service';
import { UserView } from '../../models/user-view.model';
import { Group } from '../../../../../core/api/models/group.model';

/**
 * Tests de `ChangeRoleDialog`.
 *
 * Diálogo para cambiar el grupo de rol de un usuario existente. Mismo dropdown
 * dinámico que `UserDialog`, poblado con los grupos reales del portal. El emit
 * lleva el uuid del target y el grupo nuevo (uuid + name) para que el facade
 * agregue al nuevo y retire de los previos manteniendo la invariante atómica.
 *
 * Ciclos 12, 17 TDD — Sprint 5.
 */
describe('ChangeRoleDialog', () => {
  let fixture: ComponentFixture<ChangeRoleDialog>;
  let component: ChangeRoleDialog;
  let getAssignableGroupsFn: ReturnType<typeof vi.fn>;

  function buildGroup(uuid: string, name: string): Group {
    return {
      uuid,
      name,
      permanent: name === 'Administrator',
      type: 'group',
      _links: {
        self: { href: `/server/api/eperson/groups/${uuid}` },
        object: { href: '' },
        epersons: { href: `/server/api/eperson/groups/${uuid}/epersons` },
        subgroups: { href: `/server/api/eperson/groups/${uuid}/subgroups` },
      },
    };
  }

  function buildUserView(overrides: Partial<UserView> = {}): UserView {
    return {
      uuid: 'uuid-target',
      email: 'target@mineduc.gob.gt',
      firstName: 'Target',
      lastName: 'User',
      role: 'admin_subdireccion',
      subdivision: 'ED_BASICA',
      status: 'active',
      lastActive: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    getAssignableGroupsFn = vi.fn().mockReturnValue(
      of([
        buildGroup('g-admin', 'Administrator'),
        buildGroup('g-ae-basica', 'ADMIN_ED_BASICA'),
        buildGroup('g-ae-trabajo', 'ADMIN_ED_TRABAJO'),
        buildGroup('g-se-basica', 'SUBMITTERS_ED_BASICA'),
      ]),
    );

    TestBed.configureTestingModule({
      imports: [ChangeRoleDialog],
      providers: [
        provideNoopAnimations(),
        {
          provide: UserManagementService,
          useValue: { getAssignableGroups$: getAssignableGroupsFn },
        },
      ],
    });

    fixture = TestBed.createComponent(ChangeRoleDialog);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('target', buildUserView());
  });

  /** Verifica que el diálogo pida la lista de grupos al facade al primer render. */
  it('should request getAssignableGroups$ on init', () => {
    fixture.detectChanges();
    expect(getAssignableGroupsFn).toHaveBeenCalled();
  });

  /** Verifica que se rendericen todos los grupos asignables como opciones del dropdown. */
  it('should render every assignable group as an option', () => {
    fixture.detectChanges();
    const names = (component as any).roleOptions().map((o: any) => o.value.name);
    expect(names).toEqual([
      'Administrator',
      'ADMIN_ED_BASICA',
      'ADMIN_ED_TRABAJO',
      'SUBMITTERS_ED_BASICA',
    ]);
  });

  /** Verifica que el emit lleve uuid del target y el grupo nuevo completo (uuid + name). */
  it('should emit changeSubmitted with the target uuid and the selected group', async () => {
    fixture.detectChanges();
    (component as any).form.patchValue({ targetGroupUuid: 'g-ae-trabajo' });

    const emitted = firstValueFrom(outputToObservable(component.changeSubmitted));
    (component as any).onSubmit();
    const payload = await emitted;

    expect(payload).toEqual({
      uuid: 'uuid-target',
      newGroup: { uuid: 'g-ae-trabajo', name: 'ADMIN_ED_TRABAJO' },
    });
  });
});
