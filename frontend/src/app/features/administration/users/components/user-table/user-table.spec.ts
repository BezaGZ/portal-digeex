/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { EMPTY } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';

import { UserTable } from './user-table';
import { UserView } from '../../models/user-view.model';

/**
 * Tests del componente UserTable.
 *
 * El table es un componente de presentación: recibe la lista por input
 * y emite outputs cuando el usuario pide desactivar, reactivar o
 * restablecer contraseña. El contenedor Users hace el trabajo real
 * contra el facade y maneja los toasts.
 * 
 * Ciclo 12 — Sprint 5.
 * 
 */
describe('UserTable', () => {
  let fixture: ComponentFixture<UserTable>;
  let component: UserTable;

  function buildUserView(overrides: Partial<UserView> = {}): UserView {
    return {
      uuid: 'uuid-default',
      email: 'persona@mineduc.gob.gt',
      firstName: 'Persona',
      lastName: 'De Prueba',
      role: 'personal_delegado',
      subdivision: 'Educación Básica',
      status: 'active',
      lastActive: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UserTable],
      providers: [
        provideNoopAnimations(),
        // ConfirmationService.confirm dispara el accept callback al instante
        // para que el test pueda observar el output sin abrir el diálogo real.
        // Los Observables se dejan en EMPTY porque el p-confirmDialog del
        // template se suscribe en ngOnInit y no queremos que dispare nada.
        {
          provide: ConfirmationService,
          useValue: {
            confirm: (config: { accept?: () => void }) => config.accept?.(),
            requireConfirmation$: EMPTY,
            accept: EMPTY,
          },
        },
        { provide: MessageService, useValue: { add: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(UserTable);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('users', []);
  });

  /** Acceso al componente como any para suscribirse a outputs sin pelear con tipos. */
  function asAny(value: unknown): any {
    return value as any;
  }

  /** Render: la fila viene del input, no de un signal interno. */
  it('should render rows from the users input on init', () => {
    const rows = [
      buildUserView({ uuid: 'uuid-1', firstName: 'Carlos', lastName: 'Ramírez' }),
      buildUserView({ uuid: 'uuid-2', firstName: 'Ana', lastName: 'López' }),
    ];
    fixture.componentRef.setInput('users', rows);
    fixture.detectChanges();

    const rendered = fixture.nativeElement.textContent ?? '';
    expect(rendered).toContain('Carlos');
    expect(rendered).toContain('Ramírez');
    expect(rendered).toContain('Ana');
    expect(rendered).toContain('López');
  });

  /** Output deactivateRequested: el table no llama al servicio, el padre decide. */
  it('should emit deactivateRequested with the user when the user confirms the deactivate dialog', () => {
    const target = buildUserView({ uuid: 'uuid-target' });
    fixture.componentRef.setInput('users', [target]);
    fixture.componentRef.setInput('currentUser', buildUserView({ uuid: 'uuid-caller', role: 'superadmin' }));

    const emitted: UserView[] = [];
    asAny(component).deactivateRequested.subscribe((u: UserView) => emitted.push(u));

    component.onDeactivate(target);

    expect(emitted).toEqual([target]);
  });

  /** Output reactivateRequested. */
  it('should emit reactivateRequested with the user when the user confirms the reactivate dialog', () => {
    const target = buildUserView({ uuid: 'uuid-target', status: 'inactive' });
    fixture.componentRef.setInput('users', [target]);
    fixture.componentRef.setInput('currentUser', buildUserView({ uuid: 'uuid-caller', role: 'superadmin' }));

    const emitted: UserView[] = [];
    asAny(component).reactivateRequested.subscribe((u: UserView) => emitted.push(u));

    component.onReactivate(target);

    expect(emitted).toEqual([target]);
  });

  /** Output resetPasswordRequested. */
  it('should emit resetPasswordRequested with the user when the user confirms the reset dialog', () => {
    const target = buildUserView({ uuid: 'uuid-target' });
    fixture.componentRef.setInput('users', [target]);
    fixture.componentRef.setInput('currentUser', buildUserView({ uuid: 'uuid-caller', role: 'superadmin' }));

    const emitted: UserView[] = [];
    asAny(component).resetPasswordRequested.subscribe((u: UserView) => emitted.push(u));

    component.onResetPassword(target);

    expect(emitted).toEqual([target]);
  });

  /**
   * RN-12: si el caller intenta auto-desactivarse, el table no emite el
   * output. El control real de la regla vive en el facade; esto solo
   * evita un viaje innecesario al servidor.
   */
  it('should NOT emit deactivateRequested when the target uuid equals the caller uuid', () => {
    const caller = buildUserView({ uuid: 'uuid-self', role: 'superadmin' });
    fixture.componentRef.setInput('users', [caller]);
    fixture.componentRef.setInput('currentUser', caller);

    const emitted: UserView[] = [];
    asAny(component).deactivateRequested.subscribe((u: UserView) => emitted.push(u));

    component.onDeactivate(caller);

    expect(emitted).toEqual([]);
  });
});
