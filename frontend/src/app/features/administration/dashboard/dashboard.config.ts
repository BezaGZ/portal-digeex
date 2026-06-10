import { DateRange } from './components/range-bar-card/range-bar-card';
import { UserRole } from '../users/models/user-view.model';

/**
 * @fileoverview Configuración del Dashboard de KPIs.
 * Define la estructura de los widgets, la asignación de widgets por rol de usuario
 * y utilidades para generar los rangos de fechas utilizados en las consultas temporales.
 */

/**
 * Especificación del tipo y las propiedades de un widget en el Dashboard.
 *
 * Los tipos de widgets están discriminados por la propiedad `kind`:
 * - `total`: Muestra un total general de registros.
 * - `facet-bar`: Muestra un gráfico de barras basado en una faceta de búsqueda (`facetName`).
 * - `range-bar`: Muestra un gráfico de barras temporales basadas en rangos de años.
 * - `top-list`: Muestra un listado con los registros más visitados limitado por `limit`.
 */
export type DashboardWidgetSpec =
  | { kind: 'total'; label: string }
  | { kind: 'facet-bar'; label: string; facetName: string }
  | { kind: 'range-bar'; label: string }
  | { kind: 'top-list'; label: string; limit: number };

/**
 * Construye una lista de rangos anuales (`DateRange`) para los últimos N años a partir del año actual.
 * Cada rango abarca desde el 1 de enero hasta el 31 de diciembre del año respectivo.
 *
 * @param count Cantidad de años a generar hacia atrás.
 * @param now Objeto Date de referencia para el año actual (por defecto la fecha del sistema).
 */
export function buildLastNYearRanges(count: number, now: Date = new Date()): readonly DateRange[] {
  const currentYear = now.getFullYear();
  const ranges: DateRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const year = currentYear - i;
    ranges.push({
      label: String(year),
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    });
  }
  return ranges;
}

/**
 * Configuración de los widgets del Dashboard asignados para cada rol de usuario (`UserRole`).
 */
export const DASHBOARD_WIDGETS_BY_ROLE: Readonly<Partial<Record<UserRole, readonly DashboardWidgetSpec[]>>> = {
  // Orden de render: cortos primero (total + top-list comparten fila en el
  // grid de 2 columnas) y los dos charts altos abajo, para filas parejas.
  superadmin: [
    { kind: 'total', label: 'Total de items' },
    { kind: 'top-list', label: 'Top colecciones', limit: 5 },
    { kind: 'facet-bar', label: 'Distribución por tipo', facetName: 'entityType' },
    { kind: 'range-bar', label: 'Items por año' },
  ],
  admin_subdireccion: [
    { kind: 'total', label: 'Items en mi subdirección' },
    { kind: 'top-list', label: 'Top colecciones de mi subdirección', limit: 5 },
    { kind: 'facet-bar', label: 'Distribución por tipo', facetName: 'entityType' },
    { kind: 'range-bar', label: 'Items por año' },
  ],
};
