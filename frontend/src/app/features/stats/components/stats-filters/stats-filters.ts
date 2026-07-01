import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';

import { FilterConfig } from '../../models/stats-dashboard.model';

/**
 * Renderiza los `FilterConfig` declarativos que expone un renderer. Cada
 * filtro single (`type === 'select'`) se monta como `<p-select>` y cada
 * multi se monta como `<p-multiSelect>`. Mantiene los valores activos en un
 * mapa local y emite el objeto completo al container cada vez que cambia.
 */
@Component({
  selector: 'app-stats-filters',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, Select, MultiSelectModule, ButtonModule],
  templateUrl: './stats-filters.html',
})
export class StatsFiltersComponent {
  private readonly _filters = signal<readonly FilterConfig[]>([]);

  @Input({ required: true })
  set filters(value: readonly FilterConfig[]) {
    this._filters.set(value);
  }

  @Output() readonly filtersChange = new EventEmitter<Record<string, string | string[]>>();

  /** Valores activos por filterKey; vive en memoria, no en URL. */
  readonly activeFilters = signal<Record<string, string | string[]>>({});

  /** Acceso desde el template a la lista de filtros del renderer. */
  filterList(): readonly FilterConfig[] {
    return this._filters();
  }

  /** Lee el valor activo para un filtro; default string vacío si nunca se tocó. */
  valueOf(filterKey: string): string | string[] {
    return this.activeFilters()[filterKey] ?? '';
  }

  /**
   * Actualiza el valor de un filtro y emite el mapa completo. Si el valor
   * cae a empty (string vacío o array vacío), borra la entrada del mapa
   * para que el `applyFilters` del renderer no la considere activa. Cambiar
   * un filtro padre limpia la selección de los que dependen de él (`dependsOn`),
   * porque esa selección deja de ser válida bajo el nuevo valor.
   */
  setValue(filterKey: string, value: string | string[]): void {
    const next = { ...this.activeFilters() };
    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      delete next[filterKey];
    } else {
      next[filterKey] = value;
    }
    for (const dependent of this._filters()) {
      if (dependent.dependsOn === filterKey) delete next[dependent.key];
    }
    this.activeFilters.set(next);
    this.filtersChange.emit(next);
  }

  /** Resetea todos los filtros y emite el mapa vacío. */
  clear(): void {
    this.activeFilters.set({});
    this.filtersChange.emit({});
  }

  /** True si hay al menos un filtro activo; usado para mostrar el botón Limpiar. */
  hasActive(): boolean {
    return Object.keys(this.activeFilters()).length > 0;
  }

  /**
   * Con appendTo el overlay flota en el body sin heredar el ancho ni la posición
   * del campo. Copia la solución de Programa: iguala el panel al contenedor del
   * filtro (`#flt-<key>`, un div que sí resuelve el id, a diferencia del inputId
   * dinámico del p-select dentro del `@for`). Misma clase de panel que Programa.
   */
  onFilterShow(key: string): void {
    requestAnimationFrame(() => {
      const trigger = document.getElementById('flt-' + key);
      const panel = document.querySelector('.digeex-programa-panel') as HTMLElement | null;
      const root = panel?.closest('.p-overlay') as HTMLElement | null;
      if (!trigger || !root) return;

      const rect = trigger.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const width = Math.min(rect.width, viewport - 16);
      const left = Math.max(8, Math.min(rect.left, viewport - width - 8));
      root.style.setProperty('width', `${width}px`, 'important');
      root.style.setProperty('min-width', `${width}px`, 'important');
      root.style.setProperty('max-width', `${width}px`, 'important');
      root.style.setProperty('left', `${left}px`, 'important');
    });
  }
}
