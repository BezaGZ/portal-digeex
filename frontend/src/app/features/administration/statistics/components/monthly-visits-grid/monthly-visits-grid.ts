import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';

import { EmptyStateComponent } from '../../../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';
import { UsageReport } from '../../usage-report.model';

/**
 * Visualización del report `TotalVisitsPerMonth` como gráfico de barras
 * horizontales con `<p-chart>` de PrimeNG v20. Cada mes ocupa una fila y
 * la barra crece hacia la derecha proporcional a las visitas; la altura
 * del card escala con la cantidad de meses para no dejar espacio sobrante.
 *
 * El backend devuelve `points` con `label` en formato "December 2025"
 * (inglés, hardcodeado en `UsageReportUtils`). El componente parsea cada
 * label, lo traduce a español corto ("Dic 2025") y arma el dataset
 * ordenado cronológicamente ascendente.
 *
 * La paleta de los ticks y barras se elige según `document.documentElement.classList.contains('dark')`
 * porque el preset DigeexPreset fija `--p-text-color` al azul institucional
 * que queda ilegible sobre el fondo oscuro. Un `MutationObserver` repinta
 * el chart cuando el usuario alterna el modo sin recargar la página.
 *
 * @see https://primeng.org/chart#horizontal — patrón base del demo oficial
 */
@Component({
  selector: 'app-monthly-visits-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardModule, ChartModule, EmptyStateComponent, LoadingSpinnerComponent],
  templateUrl: './monthly-visits-grid.html',
  host: { class: 'block w-full' },
})
export class MonthlyVisitsGrid implements OnInit {
  readonly report = input<UsageReport | null>(null);
  readonly loading = input<boolean>(false);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** Observa cambios de la class `dark` en `<html>` para repintar el chart
   *  con los colores adecuados cuando el usuario alterna modo claro/noche
   *  sin cambiar el `report` input. */
  private themeObserver: MutationObserver | null = null;

  /**
   * `chartData` y `chartOptions` se publican como signals para que el
   * `<p-chart>` reactive cuando se reconstruyen en `initChart`.
   */
  data: { labels: string[]; datasets: ChartDataset[] } | null = null;
  options: ChartOptions | null = null;

  /** True cuando hay al menos un punto parseable y con valor > 0. */
  readonly hasData = computed(() => {
    const r = this.report();
    if (!r || r.points.length === 0) return false;
    return r.points.some((p) => (p.values.views ?? p.values.downloads ?? 0) > 0);
  });

  /**
   * Altura del contenedor del chart proporcional al número de barras. Cada
   * fila reserva ~36px (barra + gap) y se suman ~60px para la escala X
   * inferior, el padding interno y el title del eje. Mínimo 280px para que
   * el card no quede demasiado bajo cuando hay pocas filas.
   */
  readonly chartHeight = computed(() => {
    const r = this.report();
    const count = r?.points.length ?? 0;
    return Math.max(280, count * 36 + 60);
  });

  constructor() {
    // Reconstruye el dataset cuando el input cambia. `initChart` lee los
    // tokens CSS del tema en cada corrida, así que el render se adapta al
    // tema activo sin lógica extra.
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit(): void {
    // Repinta el chart cuando el usuario alterna entre modo claro y noche
    // sin recargar la página. Chart.js no escucha cambios de tema; sin este
    // observer los ticks quedan con los colores del modo activo al mount.
    if (!isPlatformBrowser(this.platformId)) return;
    this.themeObserver = new MutationObserver(() => this.initChart());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    this.destroyRef.onDestroy(() => this.themeObserver?.disconnect());
  }

  private initChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const r = this.report();
    if (!r) {
      this.data = null;
      this.options = null;
      this.cd.markForCheck();
      return;
    }

    // Detecta el modo activo del portal para elegir colores legibles en
    // ambos esquemas. El tema PrimeNG DigeexPreset fija `--p-text-color` al
    // azul institucional en modo claro, lo cual queda ilegible sobre el
    // fondo azul oscuro del modo noche. Por eso usamos paleta Tailwind
    // gray-* directamente: misma escala que el resto de las pantallas
    // administrativas (`text-gray-800 dark:text-gray-100`).
    const isDarkMode = document.documentElement.classList.contains('dark');

    const primaryColor = isDarkMode ? '#60a5fa' : '#2563eb';
    const textColor = isDarkMode ? '#f3f4f6' : '#1f2937';
    const textColorSecondary = isDarkMode ? '#9ca3af' : '#4b5563';
    const surfaceBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    const parsed = r.points
      .map((p) => {
        const meta = parseMonthLabel(p.label);
        if (!meta) return null;
        return { ...meta, value: p.values.views ?? p.values.downloads ?? 0 };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx,
      );

    this.data = {
      labels: parsed.map((p) => `${MONTH_SHORT_ES[p.monthIdx]} ${p.year}`),
      datasets: [
        {
          label: 'Visitas',
          backgroundColor: primaryColor,
          borderColor: primaryColor,
          borderWidth: 1,
          borderRadius: 4,
          data: parsed.map((p) => p.value),
        },
      ],
    };

    this.options = {
      indexAxis: 'y' as const,
      maintainAspectRatio: false,
      // Sin `aspectRatio` explícito: con `maintainAspectRatio: false`
      // Chart.js usa todo el espacio del contenedor y respeta la altura
      // dinámica calculada por `chartHeight`.
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: textColorSecondary, precision: 0 },
          grid: { color: surfaceBorder, drawBorder: false },
        },
        y: {
          ticks: { color: textColor, font: { weight: 500 } },
          grid: { color: surfaceBorder, drawBorder: false },
        },
      },
    };

    this.cd.markForCheck();
  }
}

interface ChartDataset {
  label: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  data: number[];
}

interface ChartOptions {
  indexAxis: 'y';
  maintainAspectRatio: boolean;
  plugins: { legend: { display: boolean } };
  scales: {
    x: {
      beginAtZero: boolean;
      ticks: { color: string; precision: number };
      grid: { color: string; drawBorder: boolean };
    };
    y: {
      ticks: { color: string; font: { weight: number } };
      grid: { color: string; drawBorder: boolean };
    };
  };
}

const MONTH_SHORT_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;

/**
 * Convierte un label del backend tipo "December 2025" al par
 * `{year, monthIdx}` (0-indexed). Devuelve `null` si el formato es
 * desconocido para que el componente lo ignore sin romper.
 */
function parseMonthLabel(label: string): { year: number; monthIdx: number } | null {
  const match = label.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const idx = months.indexOf(match[1].toLowerCase());
  const year = Number(match[2]);
  if (idx < 0 || !Number.isFinite(year)) return null;
  return { year, monthIdx: idx };
}
