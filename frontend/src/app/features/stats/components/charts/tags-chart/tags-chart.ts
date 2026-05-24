import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Renderiza los items del `ChartConfig` como tarjetas/chips en grid
 * auto-fit. Replica las "bandas de programas" del dashboard de PowerBI de
 * DIGEEX donde cada programa aparece como un cuadro con el nombre, sin
 * conteo. Los items se acomodan en una o más filas según el ancho
 * disponible: si caben todos en una fila, se ven horizontales; si no, se
 * apilan automáticamente.
 */
@Component({
  selector: 'app-tags-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './tags-chart.html',
})
export class TagsChartComponent {
  private readonly _config = signal<ChartConfig | null>(null);

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
  }

  readonly items = computed(() => this._config()?.data ?? []);
}
