/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MessageService } from 'primeng/api';

import { Profile } from './profile';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthUser } from '../../../core/auth/models/auth-session.model';
import { EPersonApiService } from '../../../core/api/eperson-api.service';
import { EPerson } from '../../../core/api/models/eperson.model';

/**
 * Tests de `Profile`.
 *
 * Pinta los datos del usuario autenticado leidos de `AuthService.currentUser()`
 * y delega el cambio de contrasena en `EPersonApiService.changeOwnPassword`.
 * Los errores se mapean a un toast con summary fija y detail por status,
 * siguiendo el enfoque de dspace-angular con sus claves de i18n.
 *
 * Ciclo 15 — Sprint 5.
 */
describe('Profile', () => {
  let component: Profile;
  let fixture: ComponentFixture<Profile>;
  let changeOwnPasswordFn: ReturnType<typeof vi.fn>;
  let updateFn: ReturnType<typeof vi.fn>;
  let messageAddFn: ReturnType<typeof vi.fn>;
  let setCurrentUserFromEPersonFn: ReturnType<typeof vi.fn>;

  function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
      uuid: 'eperson-001',
      email: 'juan.perez@mineduc.gob.gt',
      firstName: 'Juan',
      lastName: 'Pérez',
      ...overrides,
    };
  }

  function configure(currentUser: AuthUser | null = buildAuthUser()): void {
    changeOwnPasswordFn = vi.fn().mockReturnValue(of({} as EPerson));
    updateFn = vi.fn().mockReturnValue(of({} as EPerson));
    messageAddFn = vi.fn();
    setCurrentUserFromEPersonFn = vi.fn();

    const authStub: Partial<AuthService> = {
      currentUser: signal<AuthUser | null>(currentUser),
      setCurrentUserFromEPerson: setCurrentUserFromEPersonFn,
    };

    const epersonStub: Partial<EPersonApiService> = {
      changeOwnPassword: changeOwnPasswordFn,
      update: updateFn,
    } as unknown as Partial<EPersonApiService>;

    TestBed.configureTestingModule({
      imports: [Profile],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: authStub },
        { provide: EPersonApiService, useValue: epersonStub },
        {
          provide: MessageService,
          useValue: { add: messageAddFn, messageObserver: EMPTY, clearObserver: EMPTY },
        },
      ],
    });

    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
  }

  /** Verifica que Profile lea firstName, lastName y email desde AuthService.currentUser(). */
  it('should render firstName, lastName and email from AuthService.currentUser()', () => {
    configure(
      buildAuthUser({
        firstName: 'Ana',
        lastName: 'López',
        email: 'ana.lopez@mineduc.gob.gt',
      }),
    );

    fixture.detectChanges();

    expect((component as any).firstName).toBe('Ana');
    expect((component as any).lastName).toBe('López');
    expect((component as any).email).toBe('ana.lopez@mineduc.gob.gt');
  });

  /** Verifica que isPasswordChangeValid sea false cuando newPassword y confirmPassword difieren. */
  it('should mark the form invalid when newPassword and confirmPassword do not match', () => {
    configure();
    fixture.detectChanges();

    (component as any).currentPassword = 'CurrentPass1';
    (component as any).newPassword = 'NuevaSegura1';
    (component as any).confirmPassword = 'OtraDiferente1';

    expect((component as any).isPasswordChangeValid).toBe(false);
  });

  /** Verifica que onSave llame a changeOwnPassword(uuid, current, new) cuando las contraseñas coinciden. */
  it('should PATCH /api/eperson/epersons/{uuid} with op=add path=/password value={new_password,current_password} when onSave is called with matching passwords', () => {
    configure(buildAuthUser({ uuid: 'eperson-042' }));
    fixture.detectChanges();

    (component as any).currentPassword = 'CurrentPass1';
    (component as any).newPassword = 'NuevaSegura1';
    (component as any).confirmPassword = 'NuevaSegura1';

    component.onSave();

    expect(changeOwnPasswordFn).toHaveBeenCalledWith('eperson-042', 'CurrentPass1', 'NuevaSegura1');
  });

  /** Verifica que un 403 al cambiar password muestre el toast "La contraseña actual es incorrecta". */
  it('should show summary "No se pudo cambiar la contraseña" with detail "La contraseña actual es incorrecta" on 403', () => {
    configure();
    fixture.detectChanges();

    changeOwnPasswordFn.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            statusText: 'Forbidden',
            error: { message: 'forbidden' },
          }),
      ),
    );

    (component as any).currentPassword = 'WrongCurrent';
    (component as any).newPassword = 'NuevaSegura1';
    (component as any).confirmPassword = 'NuevaSegura1';

    component.onSave();

    expect(messageAddFn).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: 'No se pudo cambiar la contraseña',
        detail: 'La contraseña actual es incorrecta',
      }),
    );
  });

  /** Verifica que un 422 con mensaje de backend propague ese texto al detail del toast. */
  it('should show summary "No se pudo cambiar la contraseña" with detail from error.error.message on 422 when the backend includes one', () => {
    configure();
    fixture.detectChanges();

    changeOwnPasswordFn.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            statusText: 'Unprocessable Entity',
            error: { message: 'La nueva contraseña ya fue usada anteriormente' },
          }),
      ),
    );

    (component as any).currentPassword = 'CurrentPass1';
    (component as any).newPassword = 'Reciclada1';
    (component as any).confirmPassword = 'Reciclada1';

    component.onSave();

    expect(messageAddFn).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: 'No se pudo cambiar la contraseña',
        detail: 'La nueva contraseña ya fue usada anteriormente',
      }),
    );
  });

  /**
   * Verifica que el 422 de politica de longitud en ingles se traduzca al espanol del toast.
   * DSpace emite ese texto sin respetar Accept-Language, asi que lo mapeamos aqui.
   */
  it('should translate the 422 "at least N characters long" backend message into spanish', () => {
    configure();
    fixture.detectChanges();

    changeOwnPasswordFn.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            statusText: 'Unprocessable Entity',
            error: {
              message:
                'New password is invalid. Valid passwords must be at least 8 characters long!',
            },
          }),
      ),
    );

    (component as any).currentPassword = 'CurrentPass1';
    (component as any).newPassword = 'corta';
    (component as any).confirmPassword = 'corta';

    component.onSave();

    expect(messageAddFn).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: 'No se pudo cambiar la contraseña',
        detail: 'La nueva contraseña debe tener al menos 8 caracteres.',
      }),
    );
  });

  /**
   * Edicion de firstName y lastName del eperson autenticado.
   * Replica el patron de ProfilePageMetadataFormComponent: el service traduce
   * los campos presentes a replaces sobre /metadata/eperson.firstname|lastname.
   */
  describe('onSave() - identidad', () => {
    /** Verifica que cambiar solo firstName dispare update(uuid, { firstName }). */
    it('should call epersonApi.update with only firstName when only firstName changed', () => {
      configure(buildAuthUser({ uuid: 'eperson-042', firstName: 'Juan', lastName: 'Pérez' }));
      fixture.detectChanges();

      (component as any).firstName = 'Juana';

      component.onSave();

      expect(updateFn).toHaveBeenCalledWith('eperson-042', { firstName: 'Juana' });
    });

    /** Verifica que cambiar solo lastName dispare update(uuid, { lastName }). */
    it('should call epersonApi.update with only lastName when only lastName changed', () => {
      configure(buildAuthUser({ uuid: 'eperson-042', firstName: 'Juan', lastName: 'Pérez' }));
      fixture.detectChanges();

      (component as any).lastName = 'Pérez García';

      component.onSave();

      expect(updateFn).toHaveBeenCalledWith('eperson-042', { lastName: 'Pérez García' });
    });

    /** Verifica que cambiar ambos campos dispare update con firstName y lastName. */
    it('should call epersonApi.update with both firstName and lastName when both changed', () => {
      configure(buildAuthUser({ uuid: 'eperson-042', firstName: 'Juan', lastName: 'Pérez' }));
      fixture.detectChanges();

      (component as any).firstName = 'Juana';
      (component as any).lastName = 'Pérez García';

      component.onSave();

      expect(updateFn).toHaveBeenCalledWith('eperson-042', {
        firstName: 'Juana',
        lastName: 'Pérez García',
      });
    });

    /** Verifica que si nada cambio no se dispare ningun endpoint. */
    it('should not call any endpoint when nothing changed', () => {
      configure();
      fixture.detectChanges();

      component.onSave();

      expect(updateFn).not.toHaveBeenCalled();
      expect(changeOwnPasswordFn).not.toHaveBeenCalled();
    });

    /**
     * Verifica que tras un update exitoso un onSave sin cambios nuevos no dispare otro PATCH.
     * Evita duplicar llamadas si el usuario vuelve a pulsar Guardar sin tocar nada.
     */
    it('should show a success toast and prevent a second update when a follow-up onSave has no new identity changes', () => {
      configure(buildAuthUser({ uuid: 'eperson-042', firstName: 'Juan' }));
      fixture.detectChanges();

      (component as any).firstName = 'Juana';
      component.onSave();

      expect(updateFn).toHaveBeenCalledTimes(1);
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
          summary: 'Nombre actualizado',
        }),
      );

      component.onSave();
      expect(updateFn).toHaveBeenCalledTimes(1);
    });

    /** Verifica que un error con mensaje del backend use ese texto en el detail del toast. */
    it('should show summary "No se pudo actualizar el nombre" with detail from error.error.message when update fails with a backend message', () => {
      configure();
      fixture.detectChanges();

      updateFn.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              statusText: 'Unprocessable Entity',
              error: { message: 'El nombre no puede estar vacío' },
            }),
        ),
      );

      (component as any).firstName = '';

      component.onSave();

      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'No se pudo actualizar el nombre',
          detail: 'El nombre no puede estar vacío',
        }),
      );
    });

    /** Verifica que si cambiaron identidad y password, onSave dispare ambos endpoints. */
    it('should call both epersonApi.update and epersonApi.changeOwnPassword when identity changed and password form is valid', () => {
      configure(buildAuthUser({ uuid: 'eperson-042' }));
      fixture.detectChanges();

      (component as any).firstName = 'Juana';
      (component as any).currentPassword = 'CurrentPass1';
      (component as any).newPassword = 'NuevaSegura1';
      (component as any).confirmPassword = 'NuevaSegura1';

      component.onSave();

      expect(updateFn).toHaveBeenCalledWith('eperson-042', { firstName: 'Juana' });
      expect(changeOwnPasswordFn).toHaveBeenCalledWith(
        'eperson-042',
        'CurrentPass1',
        'NuevaSegura1',
      );
    });

    /**
     * Verifica que tras el PATCH se rehidrate AuthService.currentUser con el EPerson devuelto.
     * Asi la topbar refleja el nombre nuevo sin necesidad de relogin ni GET adicional.
     */
    it('should update AuthService.currentUser via setCurrentUserFromEPerson with the EPerson returned by PATCH', () => {
      configure(buildAuthUser({ uuid: 'eperson-042', firstName: 'Juan', lastName: 'Pérez' }));
      fixture.detectChanges();

      const updatedEPerson = {
        uuid: 'eperson-042',
        email: 'juan.perez@mineduc.gob.gt',
        metadata: {
          'eperson.firstname': [
            { value: 'Juana', language: null, authority: null, confidence: -1, place: 0 },
          ],
          'eperson.lastname': [
            { value: 'Pérez García', language: null, authority: null, confidence: -1, place: 0 },
          ],
        },
        type: 'eperson',
      } as unknown as EPerson;
      updateFn.mockReturnValue(of(updatedEPerson));

      (component as any).firstName = 'Juana';
      (component as any).lastName = 'Pérez García';

      component.onSave();

      expect(setCurrentUserFromEPersonFn).toHaveBeenCalledWith(updatedEPerson);
    });
  });

  /**
   * Orquestacion de onSave + validacion local previa al PATCH de password.
   * Si no hay cambios en ningun bloque se emite warning; si hay intento invalido,
   * el toast explica el motivo en vez de dejar que el backend responda 422.
   */
  describe('onSave() - validacion local y orquestacion', () => {
    /** Verifica que si nada cambio se muestre toast warn "No hiciste cambios". */
    it('should show a warning toast "No hiciste cambios" when nothing changed', () => {
      configure();
      fixture.detectChanges();

      component.onSave();

      expect(updateFn).not.toHaveBeenCalled();
      expect(changeOwnPasswordFn).not.toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'warn',
          summary: 'No hiciste cambios',
        }),
      );
    });

    /** Verifica que sin currentPassword pero con newPassword se muestre "Ingresa tu contraseña actual." y no se dispare el PATCH. */
    it('should show toast "Ingresa tu contraseña actual." and NOT dispatch when currentPassword is empty but newPassword is filled', () => {
      configure();
      fixture.detectChanges();

      (component as any).newPassword = 'NuevaSegura1';
      (component as any).confirmPassword = 'NuevaSegura1';

      component.onSave();

      expect(changeOwnPasswordFn).not.toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'No se pudo cambiar la contraseña',
          detail: 'Ingresa tu contraseña actual.',
        }),
      );
    });

    /** Verifica que con currentPassword pero sin newPassword se muestre "Ingresa la nueva contraseña." y no se dispare el PATCH. */
    it('should show toast "Ingresa la nueva contraseña." and NOT dispatch when newPassword is empty but currentPassword is filled', () => {
      configure();
      fixture.detectChanges();

      (component as any).currentPassword = 'CurrentPass1';

      component.onSave();

      expect(changeOwnPasswordFn).not.toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'No se pudo cambiar la contraseña',
          detail: 'Ingresa la nueva contraseña.',
        }),
      );
    });

    /** Verifica que si newPassword y confirmPassword no coinciden se muestre el toast de mismatch y no se dispare el PATCH. */
    it('should show toast "La nueva contraseña y la confirmación no coinciden." and NOT dispatch when new and confirm do not match', () => {
      configure();
      fixture.detectChanges();

      (component as any).currentPassword = 'CurrentPass1';
      (component as any).newPassword = 'NuevaSegura1';
      (component as any).confirmPassword = 'NoCoincide';

      component.onSave();

      expect(changeOwnPasswordFn).not.toHaveBeenCalled();
      expect(messageAddFn).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'No se pudo cambiar la contraseña',
          detail: 'La nueva contraseña y la confirmación no coinciden.',
        }),
      );
    });

    /** Verifica que un password invalido no bloquee el update de identidad. */
    it('should still dispatch epersonApi.update when identity changed but password attempt is invalid', () => {
      configure(buildAuthUser({ uuid: 'eperson-042', firstName: 'Juan' }));
      fixture.detectChanges();

      (component as any).firstName = 'Juana';
      (component as any).currentPassword = 'CurrentPass1';
      (component as any).newPassword = 'NuevaSegura1';
      (component as any).confirmPassword = 'NoCoincide';

      component.onSave();

      expect(updateFn).toHaveBeenCalledWith('eperson-042', { firstName: 'Juana' });
      expect(changeOwnPasswordFn).not.toHaveBeenCalled();
    });

    /** Verifica que si solo cambio identidad y los 3 campos de password estan vacios, no se dispare ningun toast de password. */
    it('should NOT fire any password-validation toast when only identity changed and all three password fields are empty', () => {
      configure(buildAuthUser({ uuid: 'eperson-042', firstName: 'Juan' }));
      fixture.detectChanges();

      (component as any).firstName = 'Juana';

      component.onSave();

      expect(updateFn).toHaveBeenCalledWith('eperson-042', { firstName: 'Juana' });
      expect(changeOwnPasswordFn).not.toHaveBeenCalled();
      const passwordValidationCalls = messageAddFn.mock.calls.filter(
        (call: any[]) =>
          call[0]?.summary === 'No se pudo cambiar la contraseña' &&
          (call[0]?.detail === 'Ingresa tu contraseña actual.' ||
            call[0]?.detail === 'Ingresa la nueva contraseña.' ||
            call[0]?.detail === 'La nueva contraseña y la confirmación no coinciden.'),
      );
      expect(passwordValidationCalls.length).toBe(0);
    });
  });

  /**
   * Signal passwordValidationError: controla el p-message inline del bloque de seguridad.
   * Se setea en onSave cuando la validacion local falla y se limpia al tipear en cualquier
   * campo de password, para que el marcador rojo desaparezca mientras el usuario corrige.
   */
  describe('passwordValidationError signal', () => {
    /** Verifica que onSave con mismatch setee passwordValidationError con el detail correspondiente. */
    it('should set passwordValidationError signal with mismatch detail when validation fails on onSave', () => {
      configure();
      fixture.detectChanges();

      (component as any).currentPassword = 'CurrentPass1';
      (component as any).newPassword = 'NuevaSegura1';
      (component as any).confirmPassword = 'NoCoincide';

      component.onSave();

      expect(component.passwordValidationError()).toBe(
        'La nueva contraseña y la confirmación no coinciden.',
      );
    });

    /** Verifica que onPasswordFieldChange limpie el signal passwordValidationError. */
    it('should clear passwordValidationError signal on onPasswordFieldChange', () => {
      configure();
      fixture.detectChanges();

      (component as any).currentPassword = 'CurrentPass1';
      (component as any).newPassword = 'NuevaSegura1';
      (component as any).confirmPassword = 'NoCoincide';
      component.onSave();
      expect(component.passwordValidationError()).not.toBeNull();

      component.onPasswordFieldChange();

      expect(component.passwordValidationError()).toBeNull();
    });

    /** Verifica que un onSave valido despues de uno invalido limpie el signal y dispare el PATCH. */
    it('should clear passwordValidationError signal when a follow-up onSave passes validation', () => {
      configure(buildAuthUser({ uuid: 'eperson-042' }));
      fixture.detectChanges();

      (component as any).currentPassword = 'CurrentPass1';
      (component as any).newPassword = 'NuevaSegura1';
      (component as any).confirmPassword = 'NoCoincide';
      component.onSave();
      expect(component.passwordValidationError()).not.toBeNull();

      (component as any).confirmPassword = 'NuevaSegura1';
      component.onSave();

      expect(changeOwnPasswordFn).toHaveBeenCalledWith(
        'eperson-042',
        'CurrentPass1',
        'NuevaSegura1',
      );
      expect(component.passwordValidationError()).toBeNull();
    });
  });
});
