import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

import { ChartConfig } from '../../../models/stats-dashboard.model';

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
})
export class HistogramChartComponent {
  private readonly _config = signal<ChartConfig | null>(null);

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
          backgroundColor: '#5879B6',
          hoverBackgroundColor: '#1E3159',
          borderColor: '#1E3159',
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
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
    },
  };
}
