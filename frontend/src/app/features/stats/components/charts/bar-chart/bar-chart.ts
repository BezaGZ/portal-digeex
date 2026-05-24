import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

import { ChartConfig } from '../../../models/stats-dashboard.model';
import { readChartColors } from '../chart-colors.util';

/**
 * Wrapper de `<p-chart type="bar">` (barras verticales). Mismo patrón que
 * `PieChartComponent`: adapta `ChartConfig` a `{ labels, datasets }` de
 * Chart.js. La leyenda se oculta porque la bar chart suele tener una sola
 * serie y el label de cada bar ya está en el eje X.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChartModule],
  templateUrl: './bar-chart.html',
})
export class BarChartComponent {
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
          backgroundColor: this.colors.primary,
          hoverBackgroundColor: this.colors.primaryHover,
          borderRadius: 4,
        },
      ],
    };
  });

  /**
   * `layout.padding.top` deja espacio para el datalabel sobre la barra más
   * alta. `scales.x.ticks.maxRotation` rota labels largos hasta 45° y
   * autoSkip=false los muestra todos sin saltarse ninguno.
   */
  readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 24 } },
    plugins: {
      legend: { display: false },
      datalabels: {
        anchor: 'end' as const,
        align: 'top' as const,
        color: this.colors.primary,
        font: { weight: 'bold' as const, size: 11 },
        formatter: (value: number) => value.toLocaleString('es-GT'),
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 45, minRotation: 0, autoSkip: false },
      },
      y: {
        beginAtZero: true,
        grace: '10%',
        grid: { color: this.colors.axisGrid },
      },
    },
  };
}
