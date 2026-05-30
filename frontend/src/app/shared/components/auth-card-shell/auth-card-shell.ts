import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CardModule } from 'primeng/card';

/**
 * Shell visual de las pantallas auth (login, request, confirm). Centraliza
 * contenedor, card, logo, título y footer institucionales; el form de
 * cada pantalla viaja por `<ng-content>` para mantener el shell agnóstico.
 */
@Component({
  selector: 'app-auth-card-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardModule],
  templateUrl: './auth-card-shell.html',
})
export class AuthCardShell {
  /** Título principal de la pantalla; obligatorio para que cada consumidor lo defina. */
  title = input.required<string>();

  /** Subtítulo bajo el título; valor por defecto coincide con el slogan del portal. */
  subtitle = input<string>('Portal de Gestión del Conocimiento DIGEEX');

  /** Atribución institucional del footer; el default es la firma estándar del portal. */
  footer = input<string>('Ministerio de Educación — Guatemala');

  /** Fuente del logo; el default apunta al asset estático del portal. */
  logoSrc = input<string>('/logo-side.png');

  /** Texto alternativo del logo para accesibilidad. */
  logoAlt = input<string>('Logo DIGEEX');
}
