import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Wrapper de `<p-chart type="pie">`. Transforma el `ChartConfig` agnóstico
 * del proyecto en el shape `{ labels, datasets }` que Chart.js espera. La
 * paleta de colores se deriva de las CSS vars del design system para que el
 * tema Aura del proyecto sea consistente entre charts.
 */
@Component({
  selector: 'app-pie-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChartModule],
  templateUrl: './pie-chart.html',
})
export class PieChartComponent {
  private readonly _config = signal<ChartConfig | null>(null);

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
  }

  readonly title = computed(() => this._config()?.title ?? '');

  /** Data en shape Chart.js: `{ labels: string[], datasets: [{ data, backgroundColor }] }`. */
  readonly chartData = computed(() => {
    const cfg = this._config();
    if (!cfg) return { labels: [], datasets: [] };
    return {
      labels: cfg.data.map((d) => d.label),
      datasets: [
        {
          data: cfg.data.map((d) => d.value),
          backgroundColor: PALETTE,
          hoverBackgroundColor: PALETTE,
        },
      ],
    };
  });

  /**
   * Opciones de Chart.js: leyenda abajo con valor + porcentaje al lado de
   * cada label para que el usuario lea las cifras sin tener que hacer hover
   * sobre el slice. Los datalabels dentro del pie quedan deshabilitados
   * porque cuando un slice es muy dominante (ej. EN PROCESO 95.8% en
   * Resultados) los textos se apilan ilegibles en el centro.
   */
  readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          usePointStyle: true,
          padding: 14,
          generateLabels: (chart: {
            data: { labels?: string[]; datasets: { data: number[]; backgroundColor?: string[] }[] };
          }) => {
            const labels = chart.data.labels ?? [];
            const dataset = chart.data.datasets[0];
            const values = dataset?.data ?? [];
            const colors = dataset?.backgroundColor ?? [];
            const total = values.reduce((acc, v) => acc + (v ?? 0), 0);

            return labels.map((label, i) => {
              const value = values[i] ?? 0;
              const pct = total ? ((value / total) * 100).toFixed(1) : '0.0';
              return {
                text: `${label}  ${value.toLocaleString('es-GT')} (${pct}%)`,
                fillStyle: colors[i] ?? '#1E3159',
                strokeStyle: colors[i] ?? '#1E3159',
                hidden: false,
                index: i,
              };
            });
          },
        },
      },
      datalabels: {
        display: false,
      },
    },
  };
}

/**
 * Paleta para slices del pie. Tomada de la línea oficial de macrotemas de
 * gobierno (`--color-gob-primary`, `--color-gob-accent`, etc.) pero
 * resolviendo a HEX porque Chart.js no lee CSS vars en runtime.
 */
const PALETTE = [
  '#1E3159', // gob-primary
  '#F2A119', // gob-accent
  '#026961', // seguridad
  '#9F0B30', // competitividad
  '#FE8B5A', // oportunidad
  '#888EA5', // modernidad
  '#233E72', // gob-primary-light
  '#A8723A', // gob-accent-dark
];
