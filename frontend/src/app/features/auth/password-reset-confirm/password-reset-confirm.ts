import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageService } from 'primeng/api';
import { take } from 'rxjs/operators';

import {
  EPersonApiService,
  RegistrationTokenInvalidError,
} from '../../../core/api/eperson-api.service';
import { Registration } from '../../../core/api/models/registration.model';
import { passwordRulesValidator } from '../../../core/validators/password-rules.validator';

/**
 * Marca `passwordMismatch` en el FormGroup cuando los dos campos no coinciden.
 * Vive en el group porque el error pertenece a la relación entre los inputs.
 * El template lo lee desde `form.errors?.['passwordMismatch']`.
 */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('passwordConfirm')?.value;
  return password === confirm ? null : { passwordMismatch: true };
}

/**
 * Estados visibles de la pantalla; el template ramifica con `@switch`.
 * `loading` y `invalid` cubren la validación del token; `ready`,
 * `submitting` y `error` cubren el flujo del form de nueva contraseña.
 */
export type PasswordResetConfirmStatus =
  | 'loading'
  | 'invalid'
  | 'ready'
  | 'submitting'
  | 'error';

/**
 * Pantalla pública `/restablecer-contrasena/:token`. Recibe el token del
 * enlace que llega al correo, lo valida contra DSpace, y permite fijar una
 * contraseña nueva sin contraseña actual (el token autoriza el cambio).
 */
@Component({
  selector: 'app-password-reset-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
  ],
  templateUrl: './password-reset-confirm.html',
})
export class PasswordResetConfirm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly epersonApi = inject(EPersonApiService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);

  /**
   * Token leído del paramMap en `ngOnInit`. Se guarda en field para que el
   * `onSubmit` pueda reusarlo sin volver a leer la ruta. Es `null` solo
   * mientras la pantalla está en `loading` o el token vino vacío.
   */
  private token: string | null = null;

  /** Estado de la pantalla; el template ramifica su render según este valor. */
  protected readonly status = signal<PasswordResetConfirmStatus>('loading');

  /** Datos del registro emitidos por DSpace cuando el token es válido. */
  protected readonly registration = signal<Registration | null>(null);

  /**
   * Form reactivo de nueva contraseña. `password` aplica el validador
   * `passwordRulesValidator()` que duplica RN-03 en cliente para feedback
   * inmediato; el group lleva `passwordsMatchValidator` que marca el
   * mismatch entre los dos campos.
   */
  protected readonly form = this.fb.group(
    {
      password: ['', [Validators.required, passwordRulesValidator()]],
      passwordConfirm: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  ngOnInit(): void {
    // Lee el token del paramMap una sola vez (`take(1)`); el componente no
    // reacciona a cambios posteriores de ruta porque el token solo cambia
    // con una nueva visita al enlace del correo.
    this.route.paramMap.pipe(take(1)).subscribe((params) => {
      const token = params.get('token');
      if (!token) {
        this.status.set('invalid');
        return;
      }
      this.token = token;
      this.epersonApi.validateResetToken(token).subscribe({
        next: (reg) => {
          this.registration.set(reg);
          this.status.set('ready');
        },
        error: (err) => {
          if (err instanceof RegistrationTokenInvalidError) {
            this.status.set('invalid');
            return;
          }
          // Errores de red u otros no esperados se tratan como token inválido
          // de cara al usuario para evitar dejar la pantalla en spinner.
          this.status.set('invalid');
        },
      });
    });
  }

  /**
   * Dispara el PATCH a `/password` cuando el form es válido. No-op si el
   * form tiene errores; el template ya los marca antes del submit. En éxito
   * navega a `/iniciar-sesion` con toast; en fallo deja el form para reintento.
   */
  protected onSubmit(): void {
    if (this.form.invalid || !this.registration() || !this.token) {
      return;
    }
    const password = this.form.value.password ?? '';
    const uuid = this.registration()!.user;
    if (!uuid) {
      // Defensa: un token de tipo REGISTER vendría sin `user`; no aplica al
      // flujo de reset pero protege de un PATCH a un uuid vacío.
      return;
    }
    this.status.set('submitting');
    this.epersonApi.resetPasswordWithToken(uuid, this.token, password).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Contraseña actualizada',
          detail: 'Iniciá sesión con tu nueva contraseña.',
        });
        this.router.navigate(['/iniciar-sesion']);
      },
      error: () => {
        this.status.set('error');
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo actualizar la contraseña',
          detail: 'Reintentá en unos momentos o solicitá un nuevo enlace.',
        });
      },
    });
  }

  protected goToLogin(): void {
    this.router.navigate(['/iniciar-sesion']);
  }
}
