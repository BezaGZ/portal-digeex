import { ChangeDetectionStrategy, Component, HostListener, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { topojson } from 'chartjs-chart-geo';

import { ChartConfig } from '../../../models/stats-dashboard.model';
import { readChartColors } from '../chart-colors.util';
import { normalizeDepartamento } from '../../../utils/normalize-departamento.util';
import rawGtmTopology from '../../../../../../assets/geo/guatemala-departamentos.topo.json';

/** Feature de departamento del TopoJSON de minfin-bi (solo las props consumidas). */
interface DeptFeature {
  readonly type: string;
  readonly properties: { readonly id: number; readonly Departamento: string };
  readonly geometry: unknown;
}

/**
 * Mapa coroplético de los 22 departamentos de Guatemala con gradiente azul
 * institucional. Matchea los nombres del Excel contra el TopoJSON oficial
 * vía `normalizeDepartamento`; los departamentos sin fila reciben valor 0
 * para que el mapa pinte la silueta completa.
 */
@Component({
  selector: 'app-map-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChartModule],
  templateUrl: './map-chart.html',
  host: { class: 'block w-full' },
})
export class MapChartComponent {
  private readonly _config = signal<ChartConfig | null>(null);
  private readonly colors = readChartColors();

  @Input({ required: true })
  set config(value: ChartConfig) {
    this._config.set(value);
  }

  readonly title = computed(() => this._config()?.title ?? '');

  /** Filas del Excel ordenadas desc por valor para la lista lateral del mapa. */
  readonly sortedRows = computed(() => {
    const cfg = this._config();
    if (!cfg) return [];
    return [...cfg.data].sort((a, b) => b.value - a.value);
  });

  /**
   * Ancho del viewport, refrescado en resize. PrimeNG `<p-chart>` exige
   * valores pixel en width/height del canvas: percentages no funcionan.
   */
  private readonly viewportWidth = signal(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );

  @HostListener('window:resize')
  onResize(): void {
    if (typeof window !== 'undefined') this.viewportWidth.set(window.innerWidth);
  }

  /** Ancho del canvas por breakpoint Tailwind (sm 640, lg 1024). */
  readonly mapWidth = computed(() => {
    const vw = this.viewportWidth();
    if (vw < 640) return 320;
    if (vw < 1024) return 520;
    return 720;
  });

  /** Alto con aspect 1.4 para que el card no crezca demasiado en desktop. */
  readonly mapHeight = computed(() => Math.round(this.mapWidth() / 1.4));

  /**
   * PrimeNG `ChartModule` tipa `type` con una unión estricta que no incluye
   * `choropleth` (el plugin lo registra en runtime sobre Chart.js, no en
   * compile-time). Cast a `any` para destrabar el chequeo.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly chartType: any = 'choropleth';

  /**
   * Features de Guatemala convertidos a GeoJSON al cargar el módulo.
   * Cast doble (any → tipo concreto) por overload mal resuelto de
   * `topojson.feature`: con `GeometryCollection` devuelve `FeatureCollection`,
   * pero la firma TS elige el overload `Feature` salvo tipado nominal.
   */
  private readonly features: ReadonlyArray<DeptFeature> = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topology = rawGtmTopology as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = topojson.feature(topology, topology.objects.departamentos_gtm) as any;
    return Array.isArray(fc?.features) ? (fc.features as DeptFeature[]) : [];
  })();

  readonly chartData = computed(() => {
    const cfg = this._config();
    if (!cfg) return { labels: [], datasets: [] };

    const valueByDept = new Map<string, number>();
    for (const row of cfg.data) {
      valueByDept.set(normalizeDepartamento(row.label), row.value);
    }

    const data = this.features.map((f) => ({
      feature: f,
      value: valueByDept.get(normalizeDepartamento(f.properties?.Departamento)) ?? 0,
    }));

    return {
      labels: this.features.map((f) => f.properties?.Departamento ?? ''),
      datasets: [
        {
          label: cfg.title,
          data,
          // outline: chartjs-chart-geo lo usa para los bounds del Mercator.
          // Sin él la proyección no sabe a qué área enfocar.
          outline: this.features,
          borderColor: this.colors.surface,
          borderWidth: 0.5,
        },
      ],
    };
  });

  /**
   * Mercator preserva ángulos (estándar para países chico-medianos). Color
   * scale cuantitativa interpolada con el gradiente institucional.
   * `animation: false` evita el crash de Chart.js al intentar mutar features
   * frozen del JSON estático bundleado.
   */
  readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    showOutline: true,
    showGraticule: false,
    animation: false,
    layout: { padding: 0 },
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
      tooltip: {
        callbacks: {
          title: (items: { raw?: { feature?: { properties?: { Departamento?: string } } } }[]) =>
            items[0]?.raw?.feature?.properties?.Departamento ?? '',
          label: (ctx: { raw?: { value?: number } }) =>
            (ctx.raw?.value ?? 0).toLocaleString('es-GT'),
        },
      },
    },
    scales: {
      projection: {
        axis: 'x' as const,
        projection: 'mercator' as const,
        padding: 0,
        projectionScale: 1,
      },
      color: {
        axis: 'x' as const,
        quantize: 5,
        legend: { display: false },
        interpolate: (t: number): string => interpolateBlue(t, this.colors),
      },
    },
  };
}

/**
 * Interpola entre el azul más claro y el azul gobierno según `t` ∈ [0,1].
 * Invertido respecto al gradiente del helper: t=0 → tinte más claro,
 * t=1 → azul más oscuro.
 */
function interpolateBlue(t: number, colors: { primary: string; treemapPalette: readonly string[] }): string {
  const palette = colors.treemapPalette;
  const idx = Math.min(palette.length - 1, Math.max(0, Math.floor((1 - t) * (palette.length - 1))));
  return palette[idx] ?? colors.primary;
}
