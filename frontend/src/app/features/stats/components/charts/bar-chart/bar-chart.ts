import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

import { ChartConfig } from '../../../models/stats-dashboard.model';
import { readChartColors } from '../chart-colors.util';

/**
 * Wrapper de `<p-chart type="bar">` (barras verticales). Adapta `ChartConfig`
 * a `{ labels, datasets }` de Chart.js. La leyenda se oculta porque la bar
 * chart suele tener una sola serie y el label de cada barra ya está en el
 * eje X. Alto pasado directo al `<p-chart>` para evitar el bug del wrapper
 * con `style.height.px` (canonizado en `monthly-visits-grid` tras el Ciclo 23).
 *
 * La paleta de ticks, datalabels y grid se elige según
 * `document.documentElement.classList.contains('dark')` porque el preset
 * `DigeexPreset` fija `--p-text-color` al azul institucional, que queda
 * ilegible sobre fondo oscuro. Un `MutationObserver` sobre `<html>` repinta
 * el chart al alternar modo sin recargar la página.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChartModule],
  templateUrl: './bar-chart.html',
  host: { class: 'block w-full' },
})
export class BarChartComponent implements OnInit {
  private readonly _config = signal<ChartConfig | null>(null);
  private readonly colors = readChartColors();
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private themeObserver: MutationObserver | null = null;

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
    this.recomputeOptions();
  }

  /** Alto del canvas en px. Se pasa directo al `<p-chart>` para evitar el bug del wrapper. */
  @Input() height = '320px';

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
   * `chartOptions` se construye dinámicamente según el modo activo del
   * portal (light/dark) para que ticks, datalabels y grid queden legibles
   * en ambos esquemas. Se reasigna en cada `recomputeOptions()` que dispara
   * el setter de `config` o el `MutationObserver` del tema.
   */
  chartOptions: ReturnType<typeof this.buildOptions> = this.buildOptions();

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.themeObserver = new MutationObserver(() => this.recomputeOptions());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    this.destroyRef.onDestroy(() => this.themeObserver?.disconnect());
  }

  private recomputeOptions(): void {
    this.chartOptions = this.buildOptions();
    this.cd.markForCheck();
  }

  /**
   * Lee el modo activo y construye los options. Patrón paralelo al de
   * `monthly-visits-grid`: paleta Tailwind gray-* directa (no var del
   * preset) para que el contraste sea consistente con el resto de las
   * pantallas administrativas (`text-gray-800 dark:text-gray-100`).
   */
  private buildOptions() {
    const isDark =
      isPlatformBrowser(this.platformId) &&
      document.documentElement.classList.contains('dark');

    const textColor = isDark ? '#f3f4f6' : '#1f2937';
    const textColorSecondary = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    const datalabelColor = isDark ? '#f3f4f6' : this.colors.primary;
    const barColor = isDark ? '#60a5fa' : this.colors.primary;
    const barHoverColor = isDark ? '#93c5fd' : this.colors.primaryHover;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      datasets: {
        bar: { backgroundColor: barColor, hoverBackgroundColor: barHoverColor },
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end' as const,
          align: 'top' as const,
          color: datalabelColor,
          font: { weight: 'bold' as const, size: 11 },
          formatter: (value: number) => value.toLocaleString('es-GT'),
        },
      },
      scales: {
        x: {
          grid: { display: false, color: gridColor },
          ticks: {
            color: textColor,
            maxRotation: 45,
            minRotation: 0,
            autoSkip: false,
          },
        },
        y: {
          beginAtZero: true,
          grace: '10%',
          grid: { color: gridColor },
          ticks: { color: textColorSecondary, precision: 0 },
        },
      },
    };
  }
}
