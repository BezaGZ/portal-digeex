import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';

import { EPersonApiService } from '../../../core/api/eperson-api.service';
import { allowedEmailDomainsValidator } from '../../../core/validators/email-domain.validator';
import { environment } from '../../../../environments/environment';
import { AuthCardShell } from '../../../shared/components/auth-card-shell/auth-card-shell';

/**
 * Estados visibles de la pantalla; el template ramifica con `@switch`.
 * `form` muestra el input y el submit; `submitted` muestra el panel de
 * confirmación con los botones de volver y solicitar nuevamente.
 */
export type PasswordResetRequestViewState = 'form' | 'submitted';

/**
 * Pantalla pública `/restablecer-contrasena`. Dispara el envío del enlace
 * de reset al dominio institucional permitido; el mensaje de éxito es
 * genérico para no revelar si la cuenta existe (defensa contra enumeración).
 */
@Component({
  selector: 'app-password-reset-request',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AuthCardShell,
    ButtonModule,
    InputTextModule,
  ],
  templateUrl: './password-reset-request.html',
})
export class PasswordResetRequest {
  private readonly router = inject(Router);
  private readonly epersonApi = inject(EPersonApiService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);

  /** Lista de dominios aceptados leída del environment del build activo. */
  protected readonly allowedDomains = environment.allowedEmailDomains;

  /** Estado de la pantalla; arranca en `form` y conmuta a `submitted` tras el éxito. */
  protected readonly viewState = signal<PasswordResetRequestViewState>('form');

  /**
   * Form reactivo con un único campo email. El submit queda deshabilitado
   * hasta que pase los tres chequeos cliente: presencia, formato y
   * pertenencia al allowlist de dominios.
   */
  protected readonly form = this.fb.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        allowedEmailDomainsValidator(this.allowedDomains),
      ],
    ],
  });

  /**
   * Dispara el POST cuando el form es válido. No-op si está inválido,
   * defensa al `[disabled]` del botón. Éxito conmuta a `submitted`;
   * fallo deja el form para reintento con toast `error`.
   */
  protected onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const email = this.form.value.email ?? '';
    this.epersonApi.requestPasswordReset(email).subscribe({
      next: () => {
        this.viewState.set('submitted');
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo enviar el enlace',
          detail: 'Reintentá en unos momentos.',
        });
      },
    });
  }

  /**
   * Vuelve la pantalla al estado `form` y limpia el input para que el
   * usuario pueda solicitar otro enlace sin recargar la página.
   */
  protected restartForm(): void {
    this.form.reset({ email: '' });
    this.viewState.set('form');
  }

  protected goToLogin(): void {
    this.router.navigate(['/iniciar-sesion']);
  }
}
