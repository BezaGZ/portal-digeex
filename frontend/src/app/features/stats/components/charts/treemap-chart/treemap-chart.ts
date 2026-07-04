import { ChangeDetectionStrategy, Component, Input, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

import '../chart-setup';

import { ChartConfig } from '../../../models/stats-dashboard.model';
import { readChartColors } from '../chart-colors.util';
import { formatStatNumber } from '../../../../../core/i18n/number.util';

/**
 * Wrapper de `<p-chart type="treemap">` usando `chartjs-chart-treemap`.
 * Chart.js no expone `treemap` en su core; el controller se registra en
 * `chart-setup.ts`. El plugin pide un shape distinto al de bar/pie —
 * `tree` + `key` + `labels` — por eso este wrapper no comparte el
 * `{ labels, datasets }` plano de los otros.
 */
@Component({
  selector: 'app-treemap-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChartModule],
  templateUrl: './treemap-chart.html',
  host: { class: 'block w-full' },
})
export class TreemapChartComponent {
  private readonly _config = signal<ChartConfig | null>(null);
  private readonly colors = readChartColors();
  private readonly locale = inject(LOCALE_ID);

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
  }

  readonly title = computed(() => this._config()?.title ?? '');

  /**
   * PrimeNG `ChartModule` tipa el input `type` con una unión estricta que
   * no incluye los chart-types añadidos por plugins externos. El plugin
   * `chartjs-chart-treemap` registra `treemap` en runtime sobre Chart.js,
   * pero la firma de PrimeNG es de compile-time y rechaza el literal. El
   * cast a `any` destraba el chequeo sin tocar la API pública de PrimeNG.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly chartType: any = 'treemap';

  readonly chartData = computed(() => {
    const cfg = this._config();
    if (!cfg) return { datasets: [] };
    return {
      datasets: [
        {
          label: cfg.title,
          tree: cfg.data.map((d) => ({ label: d.label, value: d.value })),
          key: 'value',
          backgroundColor: (ctx: { dataIndex?: number }) => {
            const palette = this.colors.treemapPalette;
            const index = ctx.dataIndex ?? 0;
            return palette[index % palette.length];
          },
          borderColor: this.colors.surface,
          borderWidth: 2,
          spacing: 1,
          labels: {
            display: true,
            color: this.colors.surface,
            font: { weight: 'bold' as const, size: 12 },
            formatter: (ctx: { raw?: { _data?: { label?: string; value?: number } } }) => {
              const data = ctx.raw?._data;
              if (!data) return '';
              return `${data.label ?? ''}\n${formatStatNumber(data.value ?? 0, this.locale)}`;
            },
            overflow: 'fit' as const,
          },
        },
      ],
    };
  });

  /**
   * Leyenda y datalabels globales off: el contenido textual ya vive
   * adentro de cada rectángulo. Tooltip on para que el hover muestre
   * el valor formateado.
   */
  readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
      tooltip: {
        callbacks: {
          title: () => '',
          label: (ctx: { raw?: { _data?: { label?: string; value?: number } } }) => {
            const data = ctx.raw?._data;
            if (!data) return '';
            return `${data.label ?? ''}: ${formatStatNumber(data.value ?? 0, this.locale)}`;
          },
        },
      },
    },
  };
}
