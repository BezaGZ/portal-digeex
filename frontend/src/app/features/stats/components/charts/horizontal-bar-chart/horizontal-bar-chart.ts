import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

import { ChartConfig } from '../../../models/stats-dashboard.model';
import { readChartColors } from '../chart-colors.util';

/**
 * Wrapper de `<p-chart type="bar">` con `indexAxis: 'y'` para mostrar
 * barras horizontales (categorías en el eje Y, valores en el X). Útil para
 * labels largos que en vertical se cortarían o saldrían rotados.
 */
@Component({
  selector: 'app-horizontal-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChartModule],
  templateUrl: './horizontal-bar-chart.html',
  host: { class: 'block w-full' },
})
export class HorizontalBarChartComponent {
  private readonly _config = signal<ChartConfig | null>(null);
  private readonly colors = readChartColors();

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
  }

  readonly title = computed(() => this._config()?.title ?? '');

  readonly chartData = computed(() => {
    const cfg = this._config();
    if (!cfg) return { labels: [], datasets: [] };
    return {
      labels: cfg.data.map((d) => d.label),
      datasets: [
        {
          label: cfg.title,
          data: cfg.data.map((d) => d.value),
          backgroundColor: this.colors.secondary,
          hoverBackgroundColor: this.colors.secondaryHover,
          borderRadius: 4,
        },
      ],
    };
  });

  /**
   * `layout.padding.right` reserva espacio para el datalabel del valor más
   * grande para que no se salga del card. `scales.x.grace` agrega un margen
   * adicional al final del eje X para que la barra más larga no toque el
   * borde derecho.
   */
  readonly chartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: 64 } },
    plugins: {
      legend: { display: false },
      datalabels: {
        anchor: 'end' as const,
        align: 'right' as const,
        color: this.colors.primary,
        font: { weight: 'bold' as const, size: 11 },
        formatter: (value: number) => value.toLocaleString('es-GT'),
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grace: '10%',
        grid: { color: this.colors.axisGrid },
      },
      y: {
        grid: { display: false },
      },
    },
  };
}
