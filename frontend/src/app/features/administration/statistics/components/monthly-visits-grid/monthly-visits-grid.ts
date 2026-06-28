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

import {
  MONTH_SHORT_ES,
  applyMonthlyWindow,
  parseMonthLabel,
} from '../../../../../core/api/monthly-window.util';
import { UsageReport } from '../../../../../core/api/models/usage-report.model';
import { INSTITUTIONAL_COLORS, THEME_NEUTRALS } from '../../../../../core/theme/institutional-colors';
import { EmptyState } from '../../../../../shared/components/empty-state/empty-state';
import { LoadingSpinner } from '../../../../../shared/components/loading-spinner/loading-spinner';

/**
 * Renderiza el reporte `TotalVisitsPerMonth` en un gráfico de barras horizontales
 * utilizando el componente `<p-chart>` de PrimeNG. La altura del contenedor se
 * ajusta proporcionalmente al número de elementos.
 *
 * Procesa las etiquetas de fecha provistas por el servidor (formato "Month YYYY")
 * traduciéndolas a español abreviado ("Ene YYYY") y ordenando los datos cronológicamente.
 *
 * Los estilos y colores de los elementos se actualizan en respuesta a los cambios
 * de tema claro y oscuro mediante un `MutationObserver` sobre el elemento `<html>`.
 *
 * @see https://primeng.org/chart#horizontal
 */
@Component({
  selector: 'app-monthly-visits-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardModule, ChartModule, EmptyState, LoadingSpinner],
  templateUrl: './monthly-visits-grid.html',
  host: { class: 'block w-full' },
})
export class MonthlyVisitsGrid implements OnInit {
  readonly report = input<UsageReport | null>(null);
  readonly loading = input<boolean>(false);
  /**
   * Límite de meses a incluir en el gráfico desde la fecha actual.
   * Si es numérico, restringe el conjunto de datos a ese rango.
   * Si es `null` (por defecto), se procesan todos los registros disponibles.
   */
  readonly monthsBack = input<number | null>(null);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** Observa cambios en el atributo de clase del elemento `<html>` para actualizar el tema del gráfico. */
  private themeObserver: MutationObserver | null = null;

  /** Estructura de datos y opciones de configuración del gráfico. */
  data: { labels: string[]; datasets: ChartDataset[] } | null = null;
  options: ChartOptions | null = null;

  /** Indica si el reporte contiene registros válidos con un valor superior a cero. */
  readonly hasData = computed(() => {
    const r = this.report();
    if (!r || r.points.length === 0) return false;
    return r.points.some((p) => (p.values.views ?? p.values.downloads ?? 0) > 0);
  });

  /**
   * Dataset mensual parseado, ordenado cronológicamente y recortado a la
   * ventana activa. Única fuente para la altura y para el chart: si la
   * altura se calculara con los points crudos, una ventana corta dejaría
   * pocas barras estiradas en un lienzo dimensionado para todos los meses.
   */
  private readonly windowedData = computed(() => {
    const r = this.report();
    if (!r) return [];
    const parsedAll = r.points
      .map((p) => {
        const meta = parseMonthLabel(p.label);
        if (!meta) return null;
        return { ...meta, value: p.values.views ?? p.values.downloads ?? 0 };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx));
    return applyMonthlyWindow(parsedAll, this.monthsBack(), new Date());
  });

  /**
   * Altura calculada del contenedor del gráfico, proporcional a la cantidad de registros
   * visibles. Reserva 36 píxeles por registro más un margen base de 60 píxeles, con un
   * mínimo de 280 píxeles.
   */
  readonly chartHeight = computed(() => Math.max(280, this.windowedData().length * 36 + 60));

  constructor() {
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

    const isDarkMode = document.documentElement.classList.contains('dark');

    // Selección de colores institucionales y neutrales según el tema activo.
    const primaryColor = isDarkMode ? INSTITUTIONAL_COLORS.surface : INSTITUTIONAL_COLORS.govBlue;
    const textColor = isDarkMode ? THEME_NEUTRALS.bodyOnDark : THEME_NEUTRALS.bodyOnLight;
    const textColorSecondary = isDarkMode ? THEME_NEUTRALS.mutedOnDark : THEME_NEUTRALS.mutedOnLight;
    const surfaceBorder = isDarkMode ? THEME_NEUTRALS.gridOnDark : THEME_NEUTRALS.gridOnLight;

    const parsed = this.windowedData();

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

