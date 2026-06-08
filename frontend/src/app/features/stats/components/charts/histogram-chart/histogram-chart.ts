import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

import { ChartConfig } from '../../../models/stats-dashboard.model';
import { readChartColors } from '../chart-colors.util';

/**
 * Wrapper de `<p-chart type="bar">` para distribuciones de frecuencia con
 * barras pegadas edge-to-edge. Reproduce el look de "histograma" del
 * Tablero Consultor de DIGEEX cuando el renderer ya entrega una tally por
 * valor discreto (e.g. una entrada por edad puntual). El binning, si hace
 * falta, vive en el renderer; el componente solo se ocupa del rendering.
 */
@Component({
  selector: 'app-histogram-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChartModule],
  templateUrl: './histogram-chart.html',
  host: { class: 'block w-full' },
})
export class HistogramChartComponent {
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
          // Tint medio del gradiente azul para distinguirlo del BarChart
          // (que usa primary puro) y darle el look de densidad continua.
          backgroundColor: this.colors.treemapPalette[2],
          hoverBackgroundColor: this.colors.primary,
          borderColor: this.colors.primary,
          borderWidth: 1,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
        },
      ],
    };
  });

  /**
   * Datalabels off porque con 50+ barras los valores se solapan ilegibles.
   * `autoSkip: true` en X deja que Chart.js decida qué ticks pintar según
   * el ancho disponible. Y arranca en cero con grilla horizontal suave.
   */
  readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 8 } },
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { autoSkip: true, maxRotation: 0 },
      },
      y: {
        beginAtZero: true,
        grace: '5%',
        grid: { color: this.colors.axisGrid },
      },
    },
  };
}
