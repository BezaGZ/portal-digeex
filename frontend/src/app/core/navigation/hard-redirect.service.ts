import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Recarga la pagina por completo (no una navegacion interna de Angular). Se usa
 * al cerrar sesion: reiniciar la app deja el token CSRF sincronizado para el
 * proximo inicio de sesion. Es el mismo recurso que usa dspace-angular al salir.
 *
 * @see https://github.com/DSpace/dspace-angular/blob/dspace-9.2/src/app/core/auth/auth.service.ts
 */
@Injectable({ providedIn: 'root' })
export class HardRedirectService {
  private readonly document = inject(DOCUMENT);

  /** Navega por recarga completa del navegador a la URL dada. */
  redirect(url: string): void {
    this.document.location.href = url;
  }

  /**
   * Ruta actual (path + query), para arrastrarla como returnUrl en recargas
   * duras. Excluye un `returnUrl` preexistente en la query: arrastrarlo lo
   * anidaría en cada expiración. Se filtran los pares crudos en vez de
   * reconstruir con URLSearchParams para no re-encodear el resto.
   */
  getCurrentRoute(): string {
    const rawQuery = this.document.location.search.replace(/^\?/, '');
    const kept = rawQuery.split('&').filter((pair) => pair && !pair.startsWith('returnUrl='));
    return this.document.location.pathname + (kept.length ? `?${kept.join('&')}` : '');
  }
}
