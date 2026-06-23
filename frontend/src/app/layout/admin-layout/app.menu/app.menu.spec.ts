import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { provideRouter } from '@angular/router';

import { AppMenu } from './app.menu';
import { CallerProvider } from '../../../core/auth/caller-provider';
import { Caller } from '../../../core/auth/caller.model';
import { UserRole } from '../../../core/auth/user-role.model';

/**
 * Tests de `AppMenu`. El componente proyecta `ADMIN_MENU` filtrado por el rol
 * del caller (RN-32, RN-40, RN-41). Verifica que cada rol vea exactamente las
 * pantallas que su scope autoriza y que el caller `null` (vista del usuario
 * aún sin resolver) solo exponga items con scope universal.
 *
 * Ciclo 42 TDD — Sprint 6
 */
describe('AppMenu', () => {
  function callerFor(role: UserRole): Caller {
    return { role, sufijo: role === 'personal_delegado' ? 'ED_BASICA' : null };
  }

  async function configureMenuFor(caller: Caller | null): Promise<ComponentFixture<AppMenu>> {
    const subject = new BehaviorSubject<Caller | null>(caller);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CallerProvider,
          useValue: { currentCaller$: subject.asObservable() },
        },
      ],
    }).compileComponents();
    return TestBed.createComponent(AppMenu);
  }

  function flatLabels(model: MenuItem[]): string[] {
    return model.flatMap((section) => (section.items ?? []).map((item) => String(item.label)));
  }

  it('renders every admin entry for superadmin', async () => {
    const fixture = await configureMenuFor(callerFor('superadmin'));
    const labels = flatLabels(fixture.componentInstance.model());
    expect(labels).toEqual(
      expect.arrayContaining([
        'Estadísticas',
        'DIGEEX',
        'Subdirecciones',
        'Programas',
        'Cargar contenido',
        'Recursos',
        'Usuarios',
      ]),
    );
    expect(labels).not.toContain('Reportes');
  });

  it('hides Subdirecciones and Usuarios for admin_subdireccion', async () => {
    const fixture = await configureMenuFor(callerFor('admin_subdireccion'));
    const labels = flatLabels(fixture.componentInstance.model());
    expect(labels).toEqual(
      expect.arrayContaining([
        'Estadísticas',
        'Programas',
        'Cargar contenido',
        'Recursos',
      ]),
    );
    expect(labels).not.toContain('Subdirecciones');
    expect(labels).not.toContain('Usuarios');
    expect(labels).not.toContain('DIGEEX');
    expect(labels).not.toContain('Reportes');
  });

  it('shows only Cargar contenido for personal_delegado', async () => {
    const fixture = await configureMenuFor(callerFor('personal_delegado'));
    const labels = flatLabels(fixture.componentInstance.model());
    expect(labels).toEqual(['Cargar contenido']);
  });

  it('renders no items when the caller has not resolved yet', async () => {
    const fixture = await configureMenuFor(null);
    const labels = flatLabels(fixture.componentInstance.model());
    expect(labels).toEqual([]);
  });
});
