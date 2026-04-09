import { Injectable, signal } from '@angular/core';
import { MenuItem } from 'primeng/api';

/**
 * Servicio para manejar el breadcrumb (ruta de navegación) de la aplicación.
 * Guarda la ruta actual en un signal de solo lectura que el componente
 * de breadcrumb consume directamente.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private _trail = signal<MenuItem[]>([]);
  readonly trail = this._trail.asReadonly();

  /**
   * Actualiza la ruta de navegación completa.
   * Cada componente de vista llama esto al inicializarse.
   * @param items - Arreglo de MenuItem con label y routerLink
   */
  setTrail(items: MenuItem[]): void {
    this._trail.set(items);
  }

  /**
   * Limpia la ruta de navegación.
   * Se llama al volver a Home o al destruir una vista.
   */
  clear(): void {
    this._trail.set([]);
  }
}
