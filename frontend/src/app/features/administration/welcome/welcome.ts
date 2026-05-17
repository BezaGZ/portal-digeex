import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Landing del módulo administrativo (`/administrador`). Es la ruta a la que
 * `roleGuard` redirige cuando un usuario autenticado intenta acceder a una
 * pantalla cuya matriz de roles no lo incluye, así que el contenido se
 * mantiene neutro y útil para los tres roles del portal.
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-center min-h-[60vh] px-6">
      <h1
        class="text-3xl md:text-5xl lg:text-6xl font-extrabold text-center text-primary leading-tight"
      >
        Portal de Gestión del Conocimiento DIGEEX
      </h1>
    </div>
  `,
})
export class Welcome {}
