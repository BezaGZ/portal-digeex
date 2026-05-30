import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { PasswordResetRequest } from './password-reset-request';
import { EPersonApiService } from '../../../core/api/eperson-api.service';

/**
 * Tests de `PasswordResetRequest`.
 *
 * Pantalla pública `/restablecer-contrasena` que recibe el correo del
 * usuario que olvidó su contraseña, valida el dominio contra el
 * allowlist del environment, y dispara el POST a DSpace que envía el
 * correo con el token.
 *
 * Ciclo 2 TDD — Sprint 8.
 */
describe('PasswordResetRequest', () => {
  function configure(opts: {
    requestPasswordReset?: ReturnType<typeof vi.fn>;
    navigate?: ReturnType<typeof vi.fn>;
    toastAdd?: ReturnType<typeof vi.fn>;
  } = {}): void {
    TestBed.configureTestingModule({
      imports: [PasswordResetRequest],
      providers: [
        provideNoopAnimations(),
        {
          provide: EPersonApiService,
          useValue: {
            requestPasswordReset: opts.requestPasswordReset ?? vi.fn(),
          },
        },
        { provide: Router, useValue: { navigate: opts.navigate ?? vi.fn() } },
        { provide: MessageService, useValue: { add: opts.toastAdd ?? vi.fn() } },
      ],
    });
  }

  /** Verifica que el viewState arranque en `form` para mostrar el input. */
  it('should default viewState to form on init', () => {
    configure();
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      viewState: () => string;
    };
    expect(instance.viewState()).toBe('form');
  });

  /** Verifica que el form sea inválido cuando el dominio no está en el allowlist. */
  it('should mark form invalid when email domain is not in the allowlist', () => {
    configure();
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as { form: FormGroup };
    instance.form.setValue({ email: 'persona@gmail.com' });

    expect(instance.form.invalid).toBe(true);
    expect(instance.form.controls['email'].errors?.['emailDomain']).toBeTruthy();
  });

  /** Verifica que el form sea válido con un email dentro del allowlist. */
  it('should mark form valid when email is in the allowlist', () => {
    configure();
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as { form: FormGroup };
    instance.form.setValue({ email: 'persona@mineduc.gob.gt' });

    expect(instance.form.valid).toBe(true);
  });

  /** Verifica que el submit con form válido dispare el wrapper con el email. */
  it('should call requestPasswordReset with the email on submit', () => {
    const requestPasswordReset = vi.fn().mockReturnValue(of({}));
    configure({ requestPasswordReset });
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      form: FormGroup;
      onSubmit: () => void;
    };
    instance.form.setValue({ email: 'persona@mineduc.gob.gt' });
    instance.onSubmit();

    expect(requestPasswordReset).toHaveBeenCalledWith('persona@mineduc.gob.gt');
  });

  /** Verifica que el éxito conmute viewState a `submitted` para mostrar el panel. */
  it('should set viewState to submitted when the POST succeeds', () => {
    const requestPasswordReset = vi.fn().mockReturnValue(of({}));
    configure({ requestPasswordReset });
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      form: FormGroup;
      onSubmit: () => void;
      viewState: () => string;
    };
    instance.form.setValue({ email: 'persona@mineduc.gob.gt' });
    instance.onSubmit();

    expect(instance.viewState()).toBe('submitted');
  });

  /**
   * Verifica que el fallo del POST mantenga la pantalla en `form` y emita
   * un toast `severity: error` para que el usuario pueda reintentar.
   */
  it('should keep viewState on form and emit error toast when the POST fails', () => {
    const requestPasswordReset = vi
      .fn()
      .mockReturnValue(throwError(() => new Error('boom')));
    const toastAdd = vi.fn();
    configure({ requestPasswordReset, toastAdd });
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      form: FormGroup;
      onSubmit: () => void;
      viewState: () => string;
    };
    instance.form.setValue({ email: 'persona@mineduc.gob.gt' });
    instance.onSubmit();

    expect(instance.viewState()).toBe('form');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
  });

  /**
   * Verifica que un submit con form inválido sea no-op silencioso para que
   * el botón disabled del template no sea la única defensa contra POSTs falsos.
   */
  it('should be a no-op when the form is invalid', () => {
    const requestPasswordReset = vi.fn();
    configure({ requestPasswordReset });
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      onSubmit: () => void;
    };
    instance.onSubmit();

    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  /** Verifica que restartForm() vuelva el viewState a `form` y limpie el input. */
  it('should reset viewState to form and clear the email control on restartForm', () => {
    const requestPasswordReset = vi.fn().mockReturnValue(of({}));
    configure({ requestPasswordReset });
    const fixture = TestBed.createComponent(PasswordResetRequest);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      form: FormGroup;
      onSubmit: () => void;
      restartForm: () => void;
      viewState: () => string;
    };
    instance.form.setValue({ email: 'persona@mineduc.gob.gt' });
    instance.onSubmit();
    expect(instance.viewState()).toBe('submitted');

    instance.restartForm();

    expect(instance.viewState()).toBe('form');
    expect(instance.form.controls['email'].value).toBe('');
  });
});
