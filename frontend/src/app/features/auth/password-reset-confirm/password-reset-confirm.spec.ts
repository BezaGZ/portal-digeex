import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { FormGroup } from '@angular/forms';

import { PasswordResetConfirm } from './password-reset-confirm';
import {
  EPersonApiService,
  RegistrationTokenInvalidError,
} from '../../../core/api/eperson-api.service';
import { Registration } from '../../../core/api/models/registration.model';

/**
 * Tests de `PasswordResetConfirm`.
 *
 * Pantalla pública `/restablecer-contrasena/:token` que valida el token
 * contra DSpace vía `EPersonApiService.validateResetToken`, conmuta a
 * `invalid` con `RegistrationTokenInvalidError`, y dispara el PATCH de
 * password con toast + navegación a `/iniciar-sesion` en éxito.
 *
 * Ciclo 1 TDD — Sprint 8.
 */
describe('PasswordResetConfirm', () => {
  function buildRegistration(): Registration {
    return {
      id: 42,
      email: 'usuario@mineduc.gob.gt',
      user: 'eperson-uuid-001',
      registrationType: 'forgot',
      netId: null,
    };
  }

  function configure(opts: {
    token: string | null;
    validateResetToken: ReturnType<typeof vi.fn>;
    resetPasswordWithToken?: ReturnType<typeof vi.fn>;
    navigate?: ReturnType<typeof vi.fn>;
    toastAdd?: ReturnType<typeof vi.fn>;
  }): void {
    TestBed.configureTestingModule({
      imports: [PasswordResetConfirm],
      providers: [
        provideNoopAnimations(),
        {
          provide: EPersonApiService,
          useValue: {
            validateResetToken: opts.validateResetToken,
            resetPasswordWithToken: opts.resetPasswordWithToken ?? vi.fn(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({ get: (k: string) => (k === 'token' ? opts.token : null) }),
          },
        },
        { provide: Router, useValue: { navigate: opts.navigate ?? vi.fn() } },
        { provide: MessageService, useValue: { add: opts.toastAdd ?? vi.fn() } },
      ],
    });
  }

  /** Verifica que pase el token del paramMap a `validateResetToken`. */
  it('should call validateResetToken with the token from the route paramMap', () => {
    const validateResetToken = vi.fn().mockReturnValue(of(buildRegistration()));
    configure({ token: 'reset-token-abc123', validateResetToken });

    const fixture = TestBed.createComponent(PasswordResetConfirm);
    fixture.detectChanges();

    expect(validateResetToken).toHaveBeenCalledWith('reset-token-abc123');
  });

  /** Verifica que con token válido exponga `registration` y status `ready`. */
  it('should expose registration data and set status to ready when the token is valid', () => {
    const validateResetToken = vi.fn().mockReturnValue(of(buildRegistration()));
    configure({ token: 'reset-token-abc123', validateResetToken });

    const fixture = TestBed.createComponent(PasswordResetConfirm);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      status: () => string;
      registration: () => Registration | null;
    };
    expect(instance.registration()?.email).toBe('usuario@mineduc.gob.gt');
    expect(instance.registration()?.user).toBe('eperson-uuid-001');
    expect(instance.status()).toBe('ready');
  });

  /**
   * Verifica que ante `RegistrationTokenInvalidError` el status pase a
   * `invalid` sin redirigir, dejando el panel de error en la misma URL.
   */
  it('should set status to invalid when validateResetToken rejects with RegistrationTokenInvalidError', () => {
    const validateResetToken = vi
      .fn()
      .mockReturnValue(
        throwError(() => new RegistrationTokenInvalidError('Token de reset inválido o expirado.')),
      );
    configure({ token: 'token-expirado', validateResetToken });

    const fixture = TestBed.createComponent(PasswordResetConfirm);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      status: () => string;
      registration: () => Registration | null;
    };
    expect(instance.status()).toBe('invalid');
    expect(instance.registration()).toBeNull();
  });

  /** Verifica que el submit pase uuid, token y password al wrapper. */
  it('should call resetPasswordWithToken with uuid, token and new password on submit', () => {
    const validateResetToken = vi.fn().mockReturnValue(of(buildRegistration()));
    const resetPasswordWithToken = vi.fn().mockReturnValue(of({}));
    configure({
      token: 'reset-token-abc123',
      validateResetToken,
      resetPasswordWithToken,
    });

    const fixture = TestBed.createComponent(PasswordResetConfirm);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      form: FormGroup;
      onSubmit: () => void;
    };
    instance.form.setValue({ password: 'Segura123', passwordConfirm: 'Segura123' });
    instance.onSubmit();

    expect(resetPasswordWithToken).toHaveBeenCalledWith(
      'eperson-uuid-001',
      'reset-token-abc123',
      'Segura123',
    );
  });

  /** Verifica que el éxito navegue a `/iniciar-sesion` con toast `success`. */
  it('should navigate to /iniciar-sesion and emit success toast when reset succeeds', () => {
    const validateResetToken = vi.fn().mockReturnValue(of(buildRegistration()));
    const resetPasswordWithToken = vi.fn().mockReturnValue(of({}));
    const navigate = vi.fn();
    const toastAdd = vi.fn();
    configure({
      token: 'reset-token-abc123',
      validateResetToken,
      resetPasswordWithToken,
      navigate,
      toastAdd,
    });

    const fixture = TestBed.createComponent(PasswordResetConfirm);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      form: FormGroup;
      onSubmit: () => void;
    };
    instance.form.setValue({ password: 'Segura123', passwordConfirm: 'Segura123' });
    instance.onSubmit();

    expect(navigate).toHaveBeenCalledWith(['/iniciar-sesion']);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  /** Verifica que el fallo conmute status a `error`, lance toast y no redirija. */
  it('should set status to error and emit error toast when reset fails', () => {
    const validateResetToken = vi.fn().mockReturnValue(of(buildRegistration()));
    const resetPasswordWithToken = vi
      .fn()
      .mockReturnValue(throwError(() => new Error('boom')));
    const navigate = vi.fn();
    const toastAdd = vi.fn();
    configure({
      token: 'reset-token-abc123',
      validateResetToken,
      resetPasswordWithToken,
      navigate,
      toastAdd,
    });

    const fixture = TestBed.createComponent(PasswordResetConfirm);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      form: FormGroup;
      onSubmit: () => void;
      status: () => string;
    };
    instance.form.setValue({ password: 'Segura123', passwordConfirm: 'Segura123' });
    instance.onSubmit();

    expect(instance.status()).toBe('error');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
