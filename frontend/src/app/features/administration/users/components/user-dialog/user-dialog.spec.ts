/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { outputToObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { UserDialog, labelForGroup } from './user-dialog';
import { UserView } from '../../models/user-view.model';
import { Group } from '../../../../../core/api/models/group.model';

/**
 * Tests de `UserDialog`.
 *
 * Diálogo de alta puramente presentacional. El contenedor le pasa los grupos
 * asignables por input; aquí solo se valida el filtrado por rol del caller,
 * la preselección para admin_subdireccion y el payload del emit.
 *
 * Ciclos 12, 17 TDD — Sprint 5.
 */
describe('UserDialog', () => {
  let fixture: ComponentFixture<UserDialog>;
  let component: UserDialog;

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
      uuid: 'uuid-caller',
      email: 'caller@mineduc.gob.gt',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'superadmin',
      subdivision: null,
      status: 'active',
      lastActive: null,
      ...overrides,
    };
  }

  const assignableGroups: Group[] = [
    buildGroup('g-admin', 'Administrator'),
    buildGroup('g-ae-basica', 'ADMIN_ED_BASICA'),
    buildGroup('g-ae-trabajo', 'ADMIN_ED_TRABAJO'),
    buildGroup('g-se-basica', 'SUBMITTERS_ED_BASICA'),
    buildGroup('g-se-trabajo', 'SUBMITTERS_ED_TRABAJO'),
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UserDialog],
      providers: [provideNoopAnimations()],
    });

    fixture = TestBed.createComponent(UserDialog);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('caller', buildUserView());
    fixture.componentRef.setInput('assignableGroups', assignableGroups);
  });

  /** Verifica que superadmin vea todos los grupos asignables en el dropdown. */
  it('should expose every assignable group as a dropdown option when caller is superadmin', () => {
    fixture.detectChanges();
    const options = (component as any).roleOptions();
    const names = options.map((o: any) => o.value.name);
    expect(names).toEqual([
      'Administrator',
      'ADMIN_ED_BASICA',
      'ADMIN_ED_TRABAJO',
      'SUBMITTERS_ED_BASICA',
      'SUBMITTERS_ED_TRABAJO',
    ]);
  });

  /** Verifica que admin_subdireccion solo vea el SUBMITTERS_{sufijo} de su propia subdivisión. */
  it('should show only SUBMITTERS_{suffix} matching the admin_subdireccion caller subdivision', () => {
    fixture.componentRef.setInput(
      'caller',
      buildUserView({ role: 'admin_subdireccion', subdivision: 'ED_BASICA' }),
    );
    fixture.detectChanges();
    const options = (component as any).roleOptions();
    expect(options).toHaveLength(1);
    expect(options[0].value.name).toBe('SUBMITTERS_ED_BASICA');
  });

  /** Verifica que el control se preseleccione y quede deshabilitado cuando el caller es admin_subdireccion. */
  it('should preselect and disable the target group control when caller is admin_subdireccion', () => {
    fixture.componentRef.setInput(
      'caller',
      buildUserView({ role: 'admin_subdireccion', subdivision: 'ED_BASICA' }),
    );
    fixture.detectChanges();
    const ctrl = (component as any).form.get('targetGroupUuid');
    expect(ctrl.value).toBe('g-se-basica');
    expect(ctrl.disabled).toBe(true);
  });

  /** Verifica que superadmin mantenga el control habilitado y sin valor preseleccionado. */
  it('should leave the target group control enabled and empty when caller is superadmin', () => {
    fixture.detectChanges();
    const ctrl = (component as any).form.get('targetGroupUuid');
    expect(ctrl.disabled).toBe(false);
    expect(ctrl.value).toBeNull();
  });

  /** Verifica que el emit lleve uuid y name del grupo para que el facade valide alcance sin roundtrip. */
  it('should emit createSubmitted with email, firstName, lastName and targetGroup {uuid, name}', async () => {
    fixture.detectChanges();
    (component as any).form.patchValue({
      email: 'nuevo@mineduc.gob.gt',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      targetGroupUuid: 'g-se-basica',
    });

    const emitted = firstValueFrom(outputToObservable(component.createSubmitted));
    (component as any).onSubmit();
    const payload = await emitted;

    expect(payload).toEqual({
      email: 'nuevo@mineduc.gob.gt',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      targetGroup: { uuid: 'g-se-basica', name: 'SUBMITTERS_ED_BASICA' },
    });
  });

  /** Verifica que el form bloquee submit cuando el correo no está en el allowlist institucional. */
  it('should block submit when the email is outside the institutional allowlist', () => {
    fixture.detectChanges();
    (component as any).form.patchValue({
      email: 'ajeno@gmail.com',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      targetGroupUuid: 'g-se-basica',
    });
    expect((component as any).canSubmit()).toBe(false);
    const emailCtrl = (component as any).form.get('email');
    expect(emailCtrl.errors?.['emailDomain']).toBeTruthy();
  });

  describe('labelForGroup', () => {
    /** Verifica que el label del dropdown se derive del nombre del grupo sin tablas hardcoded. */
    it('should derive a friendly label from the group name without hardcoded tables', () => {
      expect(labelForGroup('Administrator')).toBe('Superadministrador del portal');
      expect(labelForGroup('ADMIN_ED_BASICA')).toBe('Admin · ED BASICA');
      expect(labelForGroup('SUBMITTERS_ED_TRABAJO')).toBe('Delegado · ED TRABAJO');
      expect(labelForGroup('ADMIN_ALFABETIZACION')).toBe('Admin · ALFABETIZACION');
    });
  });
});
