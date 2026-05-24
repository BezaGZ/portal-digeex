import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * KPI numérico: muestra el primer `ChartDataPoint` del `ChartConfig` como un
 * número grande con su etiqueta debajo. Sin Chart.js; layout puro CSS para
 * los indicadores rápidos del dashboard (femeninas/masculinos/total, etc.).
 */
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './kpi-card.html',
})
export class KpiCardComponent {
  private readonly _config = signal<ChartConfig | null>(null);

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
  }

  readonly value = computed(() => this._config()?.data?.[0]?.value ?? 0);
  readonly label = computed(() => this._config()?.title ?? '');
}
