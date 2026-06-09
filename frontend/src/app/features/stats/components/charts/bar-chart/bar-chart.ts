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

import { INSTITUTIONAL_COLORS, THEME_NEUTRALS } from '../../../../../core/theme/institutional-colors';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Componente wrapper de `<p-chart type="bar">` para gráficos de barras verticales.
 * Adapta `ChartConfig` a la estructura de datos `{ labels, datasets }` de Chart.js.
 *
 * Gestiona de forma reactiva la actualización de colores de textos, etiquetas y
 * cuadrículas ante cambios de tema (claro/oscuro) mediante un `MutationObserver`.
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
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private themeObserver: MutationObserver | null = null;

  /**
   * Estado reactivo del modo oscuro, actualizado por el `MutationObserver`
   * en respuesta a los cambios en el elemento `<html>`.
   */
  private readonly isDark = signal(this.readIsDark());

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
    this.recomputeOptions();
  }

  /** Alto del canvas del gráfico, aplicado directamente en la plantilla al componente `<p-chart>`. */
  @Input() height = '320px';

  readonly title = computed(() => this._config()?.title ?? '');

  readonly chartData = computed(() => {
    const cfg = this._config();
    if (!cfg) return { labels: [], datasets: [] };
    const dark = this.isDark();
    const barColor = dark ? INSTITUTIONAL_COLORS.surface : INSTITUTIONAL_COLORS.govBlue;
    const barHoverColor = dark ? INSTITUTIONAL_COLORS.surface : INSTITUTIONAL_COLORS.govBlueAccent;
    return {
      labels: cfg.data.map((d) => d.label),
      datasets: [
        {
          label: cfg.title,
          data: cfg.data.map((d) => d.value),
          backgroundColor: barColor,
          hoverBackgroundColor: barHoverColor,
          borderRadius: 4,
        },
      ],
    };
  });

  /**
   * Opciones de configuración de Chart.js, regeneradas dinámicamente en
   * `recomputeOptions()` ante cambios de configuración o cambios de tema.
   */
  chartOptions: ReturnType<typeof this.buildOptions> = this.buildOptions();

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.themeObserver = new MutationObserver(() => {
      this.isDark.set(this.readIsDark());
      this.recomputeOptions();
    });
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

  private readIsDark(): boolean {
    return (
      isPlatformBrowser(this.platformId) &&
      document.documentElement.classList.contains('dark')
    );
  }

  /**
   * Genera el objeto de opciones para Chart.js según el tema activo (claro/oscuro).
   * Configura los colores de textos, cuadrículas y etiquetas utilizando `THEME_NEUTRALS`
   * de `src/app/core/theme/institutional-colors.ts`.
   *
   * El color de las barras se define en `chartData` debido a la prioridad que tiene la
   * paleta automática de Chart.js v4 sobre la configuración de opciones.
   */
  private buildOptions() {
    const dark = this.isDark();
    const textColor = dark ? THEME_NEUTRALS.bodyOnDark : THEME_NEUTRALS.bodyOnLight;
    const textColorSecondary = dark ? THEME_NEUTRALS.mutedOnDark : THEME_NEUTRALS.mutedOnLight;
    const gridColor = dark ? THEME_NEUTRALS.gridOnDark : THEME_NEUTRALS.gridOnLight;
    const datalabelColor = dark ? INSTITUTIONAL_COLORS.surface : INSTITUTIONAL_COLORS.govBlue;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
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
