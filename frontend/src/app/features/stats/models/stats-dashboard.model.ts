/**
 * Modelo de dominio del dashboard de estadísticas.
 *
 * Estructura inmutable y agnóstica al runtime (no depende de SheetJS ni del
 * stack de gráficas). Cada `StatsRenderer` produce un `StatsDashboard` y la
 * vista pública lo renderiza despachando por `chart.type` sin conocer el
 * dataset de origen.
 */

/** Dashboard completo: una colección ordenada de secciones. */
export interface StatsDashboard {
  readonly sections: readonly ChartSection[];
}

/** Sección del dashboard con un título y una o más gráficas. */
export interface ChartSection {
  readonly title: string;
  readonly charts: readonly ChartConfig[];
  /**
   * Hint declarativo para que la vista decida cuánto ancho debe ocupar la
   * sección en el grid del detalle. `wide` ocupa 2 columnas en desktop;
   * default `normal` ocupa 1. Útil para charts con muchos labels largos.
   */
  readonly widthHint?: 'normal' | 'wide';
}

/** Tipo discriminante que la vista usa para elegir el chart-component. */
export type ChartType = 'pie' | 'bar' | 'horizontal-bar' | 'histogram' | 'treemap' | 'kpi' | 'list' | 'tags';

/** Configuración de una gráfica: tipo, título, datos y metadatos opcionales. */
export interface ChartConfig {
  readonly type: ChartType;
  readonly title: string;
  readonly data: readonly ChartDataPoint[];
  readonly meta?: ChartMeta;
}

/** Punto de datos de una gráfica: etiqueta visible y valor numérico. */
export interface ChartDataPoint {
  readonly label: string;
  readonly value: number;
}

/**
 * Metadatos opcionales de presentación. `colorHint` viaja como intención
 * semántica (`'primary'`, `'success'`) que el chart-component resuelve contra
 * las CSS vars del design system; los renderers no conocen la paleta.
 */
export interface ChartMeta {
  readonly xAxisLabel?: string;
  readonly yAxisLabel?: string;
  readonly unit?: string;
  readonly colorHint?: string;
}

/** Configuración declarativa de un filtro del dashboard. */
export interface FilterConfig {
  readonly key: string;
  readonly label: string;
  readonly type: 'select' | 'multi-select';
  readonly options: readonly FilterOption[];
}

/** Opción seleccionable dentro de un filtro. */
export interface FilterOption {
  readonly value: string;
  readonly label: string;
}
