import { StatsDashboard, FilterConfig } from '../models/stats-dashboard.model';

/**
 * Contrato del renderer de un dataset de estadísticas.
 *
 * Cada implementación lee el workbook de un Excel específico y produce un
 * `StatsDashboard` con sus secciones y filtros. La vista pública consume la
 * interfaz, no las concreciones (DIP); el dataset concreto se resuelve en
 * runtime contra `stats-dataset-registry` por el valor de `digeex.statsDataset`.
 */
export interface StatsRenderer {
  /**
   * Parsea el workbook y produce el dashboard. Si el workbook trae columnas
   * listadas en `getForbiddenColumns()`, debe lanzar `ValidationError('PII
   * no permitido')` con la lista de columnas detectadas (guardia anti-PII).
   */
  parse(workbook: unknown): StatsDashboard;

  /**
   * Devuelve los filtros declarativos derivados del dashboard. Las opciones
   * se extraen del workbook al parsear; un dataset que agregue valores
   * nuevos los expone sin redeploy.
   */
  getFilters(dashboard: StatsDashboard): readonly FilterConfig[];

  /**
   * Aplica un conjunto de filtros y devuelve un dashboard nuevo. Los modelos
   * son `readonly`; nunca se mutan. El consumer reemplaza la referencia para
   * disparar el re-render.
   */
  applyFilters(
    dashboard: StatsDashboard,
    filters: Record<string, string | string[]>,
  ): StatsDashboard;

  /**
   * Lista negra de columnas que no deben aparecer en el workbook (PII
   * identificatoria). El renderer la usa al inicio de `parse()` para
   * cancelar el procesamiento si el archivo trae alguna.
   */
  getForbiddenColumns(): readonly string[];
}
