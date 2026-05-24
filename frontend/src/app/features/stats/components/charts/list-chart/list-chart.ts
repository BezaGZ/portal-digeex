import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Lista pura de labels sin valores: replica las "tablas" del dashboard de
 * PowerBI donde la columna sirve para enumerar categorías sin necesidad de
 * conteo (ej. tipos de discapacidad presentes). El orden de la lista respeta
 * el orden del `data` array del `ChartConfig` que el renderer decida.
 */
@Component({
  selector: 'app-list-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './list-chart.html',
})
export class ListChartComponent {
  private readonly _config = signal<ChartConfig | null>(null);

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
  }

  readonly title = computed(() => this._config()?.title ?? '');
  readonly items = computed(() => this._config()?.data ?? []);
}
