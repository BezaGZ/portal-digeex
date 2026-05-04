/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { EMPTY, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
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
 * Ciclo 12 TDD — Sprint 5. Ajustado en Ciclos 16, 17.
 */
describe('Users (contenedor)', () => {
  let component: Users;
  let searchUsersFn: ReturnType<typeof vi.fn>;
  let getAssignableGroupsFn: ReturnType<typeof vi.fn>;
  let currentUserViewObservable: ReturnType<typeof of>;
  let deactivateUserFn: ReturnType<typeof vi.fn>;
  let reactivateUserFn: ReturnType<typeof vi.fn>;
  let resetPasswordFn: ReturnType<typeof vi.fn>;
  let createUserFn: ReturnType<typeof vi.fn>;
  let updateUserFn: ReturnType<typeof vi.fn>;
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
    searchUsersFn = vi.fn().mockReturnValue(of(buildPaginated([])));
    getAssignableGroupsFn = vi.fn().mockReturnValue(of([]));
    currentUserViewObservable = of(null);
    deactivateUserFn = vi.fn().mockReturnValue(of({} as EPerson));
    reactivateUserFn = vi.fn().mockReturnValue(of({} as EPerson));
    resetPasswordFn = vi.fn().mockReturnValue(of(undefined));
    createUserFn = vi.fn().mockReturnValue(of({} as EPerson));
    updateUserFn = vi.fn().mockReturnValue(of({} as EPerson));
    messageAddFn = vi.fn();

    const userServiceStub: Partial<UserManagementService> = {
      searchUsers$: searchUsersFn,
      getAssignableGroups$: getAssignableGroupsFn,
      currentUserView$: currentUserViewObservable,
      deactivateUser$: deactivateUserFn,
      reactivateUser$: reactivateUserFn,
      resetPassword$: resetPasswordFn,
      createUser$: createUserFn,
      updateUser$: updateUserFn,
    } as unknown as Partial<UserManagementService>;

    TestBed.configureTestingModule({
      imports: [Users],
      providers: [
        provideNoopAnimations(),
        { provide: UserManagementService, useValue: userServiceStub },
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

  describe('reading from the facade', () => {
    /**
     * Verifica que en el mount el contenedor pida a `searchUsers$` con
     * scope por defecto, query vacía y página 0, alineado al arranque del
     * `EPeopleRegistryComponent` de dspace-angular.
     */
    it('should request searchUsers$ on init with scope=metadata, empty query and page 0', () => {
      const fixture = TestBed.createComponent(Users);
      fixture.detectChanges();

      expect(searchUsersFn).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'metadata', query: '', page: 0 }),
      );
    });

    /**
     * Verifica que el contenedor pida los grupos asignables al facade en el
     * mount, para que los diálogos los reciban por input sin disparar una
     * request por apertura.
     */
    it('should request the assignable groups from facade.getAssignableGroups$ on init', () => {
      const fixture = TestBed.createComponent(Users);
      fixture.detectChanges();

      expect(getAssignableGroupsFn).toHaveBeenCalled();
    });

    /**
     * Verifica que un `onLazyLoad` con valores equivalentes al estado
     * inicial no dispare un segundo fetch. PrimeNG emite `onLazyLoad` al
     * inicializar la `p-table`; si el handler setea el signal con una
     * referencia nueva, el `combineLatest` del container re-emite y el
     * `switchMap` cancela la primera petición, dejando el Network tab con
     * una request "(canceled)" inútil.
     */
    it('should NOT refetch when onLazyLoad fires with values equivalent to the initial state', async () => {
      const fixture = TestBed.createComponent(Users);
      const instance = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      expect(searchUsersFn).toHaveBeenCalledTimes(1);

      asAny(instance).onLazyLoad({ first: 0, rows: 10 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(searchUsersFn).toHaveBeenCalledTimes(1);
    });

    /**
     * Verifica que `onLazyLoad` del p-table actualice el estado y dispare un
     * nuevo fetch con la página y tamaño correctos. PrimeNG emite `first`
     * (offset) y `rows` (size); el container los traduce a page/size.
     */
    it('should refetch searchUsers$ with updated page and size when onLazyLoad fires', async () => {
      const fixture = TestBed.createComponent(Users);
      const instance = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      searchUsersFn.mockClear();

      asAny(instance).onLazyLoad({ first: 25, rows: 25 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(searchUsersFn).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, size: 25 }),
      );
    });

    /**
     * Verifica que al cambiar el scope via handler se refetche con el scope
     * nuevo y la página reiniciada a 0 (UX estándar: cada búsqueda nueva
     * vuelve al inicio).
     */
    it('should reset page to 0 and refetch when scope changes', async () => {
      const fixture = TestBed.createComponent(Users);
      const instance = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();

      asAny(instance).onLazyLoad({ first: 30, rows: 10 });
      fixture.detectChanges();
      await fixture.whenStable();
      searchUsersFn.mockClear();

      asAny(instance).onScopeChange('email');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(searchUsersFn).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'email', page: 0 }),
      );
    });
  });

  describe('deactivate user', () => {
    /** Verifica que el handler colgado del output del table delegue al facade con el uuid. */
    it('should call facade.deactivateUser$ with the user uuid when the table emits deactivateRequested', () => {
      const target = buildUserView({ uuid: 'uuid-target' });

      asAny(component).onDeactivateRequested(target);

      expect(deactivateUserFn).toHaveBeenCalledWith('uuid-target');
    });

    /** Verifica que LAST_SUPERADMIN (RN-11) se mapee a un toast warn con copy en español. */
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

    /** Verifica que SELF_DEACTIVATE (RN-12) también salga como warn y no como error. */
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

    /** Verifica que cualquier error que no sea BusinessRuleError caiga al toast genérico. */
    it('should show a generic error toast when the thrown error is not a BusinessRuleError', () => {
      deactivateUserFn.mockReturnValue(throwError(() => new Error('boom HTTP 500')));

      asAny(component).onDeactivateRequested(buildUserView({ uuid: 'uuid-target' }));

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error' }),
      );
    });
  });

  describe('reactivate user', () => {
    /** Verifica que el handler delegue a reactivateUser$ del facade con el uuid del target. */
    it('should call facade.reactivateUser$ with the user uuid when the table emits reactivateRequested', () => {
      const target = buildUserView({ uuid: 'uuid-reactivate', status: 'inactive' });

      asAny(component).onReactivateRequested(target);

      expect(reactivateUserFn).toHaveBeenCalledWith('uuid-reactivate');
    });
  });

  describe('reset password', () => {
    /**
     * Verifica que el contenedor delegue el reset al facade con uuid y email.
     * El uuid viaja para que la guarda de RN-31 (autoreset) corra sin roundtrip.
     */
    it('should call facade.resetPassword$ with the user uuid and email when the table emits resetPasswordRequested', () => {
      const target = buildUserView({ uuid: 'uuid-rosa', email: 'rosa.juarez@mineduc.gob.gt' });

      asAny(component).onResetPasswordRequested(target);

      expect(resetPasswordFn).toHaveBeenCalledWith({
        uuid: 'uuid-rosa',
        email: 'rosa.juarez@mineduc.gob.gt',
      });
    });
  });

  describe('create user', () => {
    /** Verifica que el contenedor reenvíe al facade el mismo input que emitió el diálogo. */
    it('should call facade.createUser$ with the form input emitted by the dialog', () => {
      const input = {
        email: 'nuevo@mineduc.gob.gt',
        firstName: 'Nuevo',
        lastName: 'Usuario',
        targetGroup: { uuid: 'group-submitters-eb', name: 'SUBMITTERS_ED_BASICA' },
      };

      asAny(component).onCreateSubmitted(input);

      expect(createUserFn).toHaveBeenCalledWith(input);
    });
  });

  describe('edit user', () => {
    /** Verifica que onEditRequested abra el diálogo y guarde el target para el emit del diff. */
    it('should open the edit dialog and store the target when editRequested fires', () => {
      const target = buildUserView({ uuid: 'uuid-edit', firstName: 'Rosa' });

      asAny(component).onEditRequested(target);

      expect(asAny(component).showEditDialog()).toBe(true);
      expect(asAny(component).editTarget()).toEqual(target);
    });

    /** Verifica que el contenedor reenvíe al facade el diff emitido por EditUserDialog. */
    it('should call facade.updateUser$ with the diff payload emitted by the dialog', () => {
      const input = {
        uuid: 'uuid-target',
        changes: { firstName: 'Rosa María', email: 'nuevo@mineduc.gob.gt' },
      };

      asAny(component).onEditSubmitted(input);

      expect(updateUserFn).toHaveBeenCalledWith(input);
    });
  });

  /**
   * Cuando el error no es BusinessRuleError, el detail del toast debe revelar
   * el mensaje real (del body del backend o del Error) y no el genérico fijo,
   * porque el generico oculta diagnosticos utiles en operacion.
   */
  describe('errorToToast (non-BusinessRuleError errors)', () => {
    /** Verifica que un Error plano use su message como detail del toast. */
    it('should show error.message in the toast detail when the thrown error is a plain Error', () => {
      deactivateUserFn.mockReturnValue(
        throwError(() => new Error('Collection X no expone submittersGroup.')),
      );

      asAny(component).onDeactivateRequested(buildUserView({ uuid: 'uuid-target' }));

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'Error inesperado',
          detail: 'Collection X no expone submittersGroup.',
        }),
      );
    });

    /** Verifica que un HttpErrorResponse con body.message use ese texto antes que err.message. */
    it('should prefer error.error.message over error.message when the error is an HttpErrorResponse with a body message', () => {
      deactivateUserFn.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: { message: 'El grupo destino no existe' },
              status: 422,
              statusText: 'Unprocessable Entity',
            }),
        ),
      );

      asAny(component).onDeactivateRequested(buildUserView({ uuid: 'uuid-target' }));

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'Error inesperado',
          detail: 'El grupo destino no existe',
        }),
      );
    });

    /** Verifica que el detail del BusinessRuleError siga siendo su mensaje y no el extraído del HTTP (regresión). */
    it('should keep showing the BusinessRuleError detail untouched (regression)', () => {
      deactivateUserFn.mockReturnValue(
        throwError(
          () => new BusinessRuleError('DUPLICATE_EMAIL', 'Ya existe un usuario con ese correo.'),
        ),
      );

      asAny(component).onDeactivateRequested(buildUserView({ uuid: 'uuid-target' }));

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'Correo duplicado',
          detail: 'Ya existe un usuario con ese correo.',
        }),
      );
    });
  });
});
