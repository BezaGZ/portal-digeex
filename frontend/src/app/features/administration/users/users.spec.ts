/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { EMPTY, of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';

import { Users } from './users';
import { UserManagementService } from './services/user-management.service';
import { BusinessRuleError } from './services/business-rule-error';
import { UserView } from './models/user-view.model';
import { Paginated } from '../../../core/api/models/hal.model';
import { EPerson } from '../../../core/api/models/eperson.model';

/**
 * Tests del contenedor Users.
 *
 * El contenedor se suscribe a los Observable del facade y delega ahí
 * todas las mutaciones (desactivar, reactivar, restablecer contraseña,
 * crear). Los errores se mapean a toasts: BusinessRuleError genera un
 * mensaje específico por código, cualquier otro error cae al toast
 * genérico.
 *
 * Ciclo 12 — Sprint 5.
 */
describe('Users (contenedor)', () => {
  let component: Users;
  let getVisibleUsersFn: ReturnType<typeof vi.fn>;
  let currentUserViewObservable: ReturnType<typeof of>;
  let deactivateUserFn: ReturnType<typeof vi.fn>;
  let reactivateUserFn: ReturnType<typeof vi.fn>;
  let resetPasswordFn: ReturnType<typeof vi.fn>;
  let createUserFn: ReturnType<typeof vi.fn>;
  let messageAddFn: ReturnType<typeof vi.fn>;

  /** UserView mínimo para alimentar al facade en los tests. */
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

  function buildPaginated(items: UserView[]): Paginated<UserView> {
    return {
      items,
      totalElements: items.length,
      totalPages: 1,
      size: items.length,
      page: 0,
    };
  }

  beforeEach(() => {
    getVisibleUsersFn = vi.fn().mockReturnValue(of(buildPaginated([])));
    currentUserViewObservable = of(null);
    deactivateUserFn = vi.fn().mockReturnValue(of({} as EPerson));
    reactivateUserFn = vi.fn().mockReturnValue(of({} as EPerson));
    resetPasswordFn = vi.fn().mockReturnValue(of(undefined));
    createUserFn = vi.fn().mockReturnValue(of({} as EPerson));
    messageAddFn = vi.fn();

    const userServiceStub: Partial<UserManagementService> = {
      getVisibleUsers$: getVisibleUsersFn,
      currentUserView$: currentUserViewObservable,
      deactivateUser$: deactivateUserFn,
      reactivateUser$: reactivateUserFn,
      resetPassword$: resetPasswordFn,
      createUser$: createUserFn,
    } as unknown as Partial<UserManagementService>;

    TestBed.configureTestingModule({
      imports: [Users],
      providers: [
        provideNoopAnimations(),
        { provide: UserManagementService, useValue: userServiceStub },
        // Se exponen los Observables vacíos porque p-toast del template
        // se suscribe en ngOnInit y no se quiere que emita nada real.
        {
          provide: MessageService,
          useValue: { add: messageAddFn, messageObserver: EMPTY, clearObserver: EMPTY },
        },
      ],
    });

    const fixture = TestBed.createComponent(Users);
    component = fixture.componentInstance;
  });

  /** Acceso al componente como any para invocar handlers sin pelear con tipos. */
  function asAny(value: unknown): any {
    return value as any;
  }

  describe('lectura desde el facade', () => {
    /** El contenedor pide la página al facade en vez de leer un signal local. */
    it('should request the visible users from facade.getVisibleUsers$ on init', () => {
      const fixture = TestBed.createComponent(Users);
      fixture.detectChanges();

      expect(getVisibleUsersFn).toHaveBeenCalled();
    });
  });

  describe('desactivar usuario', () => {
    /** El handler que cuelga del output del table delega al facade con el uuid. */
    it('should call facade.deactivateUser$ with the user uuid when the table emits deactivateRequested', () => {
      const target = buildUserView({ uuid: 'uuid-target' });

      asAny(component).onDeactivateRequested(target);

      expect(deactivateUserFn).toHaveBeenCalledWith('uuid-target');
    });

    /** RN-11: LAST_SUPERADMIN se mapea a un toast warn con el copy en español. */
    it('should show a warning toast in es-GT when error.code === LAST_SUPERADMIN', () => {
      deactivateUserFn.mockReturnValue(
        throwError(
          () =>
            new BusinessRuleError(
              'LAST_SUPERADMIN',
              'No se puede desactivar al último superadministrador activo.',
            ),
        ),
      );

      asAny(component).onDeactivateRequested(buildUserView({ uuid: 'uuid-target' }));

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'warn',
          detail: expect.stringContaining('superadministrador'),
        }),
      );
    });

    /** RN-12: SELF_DEACTIVATE también es warn, no error. */
    it('should show a warning toast when error.code === SELF_DEACTIVATE', () => {
      deactivateUserFn.mockReturnValue(
        throwError(
          () => new BusinessRuleError('SELF_DEACTIVATE', 'No puedes desactivarte a ti mismo.'),
        ),
      );

      asAny(component).onDeactivateRequested(buildUserView({ uuid: 'uuid-target' }));

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'warn',
          detail: expect.stringContaining('mismo'),
        }),
      );
    });

    /** Cualquier error que no sea BusinessRuleError cae al toast genérico. */
    it('should show a generic error toast when the thrown error is not a BusinessRuleError', () => {
      deactivateUserFn.mockReturnValue(throwError(() => new Error('boom HTTP 500')));

      asAny(component).onDeactivateRequested(buildUserView({ uuid: 'uuid-target' }));

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error' }),
      );
    });
  });

  describe('reactivar usuario', () => {
    /** Mismo patrón que desactivar, pero contra reactivateUser$. */
    it('should call facade.reactivateUser$ with the user uuid when the table emits reactivateRequested', () => {
      const target = buildUserView({ uuid: 'uuid-reactivate', status: 'inactive' });

      asAny(component).onReactivateRequested(target);

      expect(reactivateUserFn).toHaveBeenCalledWith('uuid-reactivate');
    });
  });

  describe('restablecer contraseña', () => {
    /** El facade recibe el correo, no el uuid (DSpace lo necesita así). */
    it('should call facade.resetPassword$ with the user email when the table emits resetPasswordRequested', () => {
      const target = buildUserView({ email: 'rosa.juarez@mineduc.gob.gt' });

      asAny(component).onResetPasswordRequested(target);

      expect(resetPasswordFn).toHaveBeenCalledWith('rosa.juarez@mineduc.gob.gt');
    });
  });

  describe('crear usuario', () => {
    /** El input que se le pasa al facade es el mismo que sale del diálogo. */
    it('should call facade.createUser$ with the form input emitted by the dialog', () => {
      const input = {
        email: 'nuevo@mineduc.gob.gt',
        firstName: 'Nuevo',
        lastName: 'Usuario',
        role: 'personal_delegado' as const,
        subdivisionCommunityUuid: 'community-eb',
      };

      asAny(component).onCreateSubmitted(input);

      expect(createUserFn).toHaveBeenCalledWith(input);
    });
  });
});
