import { Component, ChangeDetectionStrategy, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../../core/auth/auth.service';
import { HardRedirectService } from '../../../core/navigation/hard-redirect.service';
import { CallerProvider } from '../../../core/auth/caller-provider';
import { AuthCardShell } from '../../../shared/components/auth-card-shell/auth-card-shell';

/** Valor del query param `error` con que el caso "sin rol" recarga el login para restaurar el mensaje. */
const NO_ROLE_ERROR_PARAM = 'sin-rol';

/** Mensaje que se muestra cuando el eperson autenticado no tiene un grupo de rol del portal. */
export const LOGIN_MISSING_ROLE_MESSAGE =
  'Tu cuenta está activa pero sin rol asignado. Contacta al administrador para asignarte acceso.';

/**
 * Mensaje del 401. DSpace responde el mismo 401 genérico para contraseña
 * incorrecta, cuenta desactivada (canLogIn=false) y cuenta que aún no
 * definió su contraseña — no revelar cuál caso es evita la enumeración de
 * cuentas, así que el mensaje orienta los tres sin confirmar ninguno.
 */
export const LOGIN_INVALID_CREDENTIALS_MESSAGE =
  'Correo o contraseña incorrectos. Si aún no ha definido su contraseña, ' +
  'revise el correo de activación; si su cuenta fue desactivada, contacte al administrador.';

/** Mensaje para fallos que no son de credenciales: red caída o error del servidor. */
export const LOGIN_SERVICE_UNAVAILABLE_MESSAGE =
  'No se pudo conectar con el servidor. Intente de nuevo en unos minutos.';

/** Mensaje cuando el login se recargó por sesión vencida (`?expired=true`). */
export const LOGIN_SESSION_EXPIRED_MESSAGE =
  'Tu sesión expiró. Volvé a iniciar sesión.';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, InputTextModule, PasswordModule, CheckboxModule, ButtonModule, AuthCardShell],
  templateUrl: './login.html',
})
export class LoginComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private hardRedirect = inject(HardRedirectService);
  private callerProvider = inject(CallerProvider);

  email = signal('');
  password = signal('');
  rememberMe = signal(false);
  errorMessage = signal('');
  isLoading = signal(false);

  /**
   * Restaura el mensaje desde el query param tras una recarga dura: `?error=sin-rol`
   * (cuenta sin rol) o `?expired=true` (sesión vencida). El param sobrevive a la
   * recarga, que además resincroniza el CSRF.
   */
  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('error') === NO_ROLE_ERROR_PARAM) {
      this.errorMessage.set(LOGIN_MISSING_ROLE_MESSAGE);
    } else if (params.get('expired') === 'true') {
      this.errorMessage.set(LOGIN_SESSION_EXPIRED_MESSAGE);
    }
  }

  /**
   * Tras un login exitoso resuelve el rol con `currentCallerSnapshot()` —desde
   * el EPerson recién autenticado, no del `shareReplay` de `currentCaller$`, que
   * puede servir el caller del usuario anterior—. Con rol navega al panel; sin
   * rol cierra la sesión y recarga al login con el motivo.
   */
  onLogin() {
    this.errorMessage.set('');
    this.isLoading.set(true);

    this.authService.login(this.email(), this.password()).subscribe({
      next: () => {
        const caller = this.callerProvider.currentCallerSnapshot();
        if (caller) {
          this.isLoading.set(false);
          this.router.navigate(['/administrador']);
        } else {
          // Sin rol: cerrar sesión y recargar duro al login con el motivo en el
          // query param. La recarga resincroniza el CSRF y el param restaura el
          // mensaje (mismo patrón que `?expired=true` de dspace).
          this.authService.logout().subscribe({
            next: () => this.hardRedirect.redirect(`/iniciar-sesion?error=${NO_ROLE_ERROR_PARAM}`),
            error: () => this.hardRedirect.redirect(`/iniciar-sesion?error=${NO_ROLE_ERROR_PARAM}`),
          });
        }
      },
      error: (err: { status?: number }) => {
        this.isLoading.set(false);
        // Solo el 401 habla de credenciales; un status 0 (red) o 5xx es
        // problema del servicio y culpar a la contraseña confunde al usuario.
        this.errorMessage.set(
          err?.status === 401 ? LOGIN_INVALID_CREDENTIALS_MESSAGE : LOGIN_SERVICE_UNAVAILABLE_MESSAGE,
        );
      },
    });
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
