import { DateRange } from './components/range-bar-card/range-bar-card';
import { UserRole } from '../users/models/user-view.model';

/**
 * Spec discriminada por `kind` de un widget del Dashboard. El `scope`
 * lo resuelve `dashboard.ts` antes de pasar la spec al componente hijo.
 */
export type DashboardWidgetSpec =
  | { kind: 'total'; label: string }
  | { kind: 'facet-bar'; label: string; facetName: string }
  | { kind: 'range-bar'; label: string; ranges: readonly DateRange[] }
  | { kind: 'top-list'; label: string; limit: number };

/**
 * Construye una ventana de `count` años terminando en el actual, para
 * alimentar el `range-bar-card` sin hardcodear los bornes cada año.
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
 * Matriz de widgets por rol. SuperAdmin ve KPIs sobre todo el repo;
 * admin_subdireccion los mismos pero acotados a su community. Roles sin
 * entrada no ven widgets (el dashboard renderiza un empty-state).
 */
export const DASHBOARD_WIDGETS_BY_ROLE: Readonly<Partial<Record<UserRole, readonly DashboardWidgetSpec[]>>> = {
  superadmin: [
    { kind: 'total', label: 'Total de items' },
    { kind: 'facet-bar', label: 'Distribución por tipo', facetName: 'entityType' },
    { kind: 'range-bar', label: 'Items por año', ranges: buildLastNYearRanges(5) },
    { kind: 'top-list', label: 'Top colecciones', limit: 5 },
  ],
  admin_subdireccion: [
    { kind: 'total', label: 'Items en mi subdirección' },
    { kind: 'facet-bar', label: 'Distribución por tipo', facetName: 'entityType' },
    { kind: 'range-bar', label: 'Items por año', ranges: buildLastNYearRanges(5) },
    { kind: 'top-list', label: 'Top colecciones de mi subdirección', limit: 5 },
  ],
};
