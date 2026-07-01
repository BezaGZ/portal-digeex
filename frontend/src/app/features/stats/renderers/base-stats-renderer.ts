import { Directive } from '@angular/core';

import { StatsRenderer } from './stats-renderer.interface';
import {
  StatsDashboard,
  ChartSection,
  FilterConfig,
  FilterOption,
} from '../models/stats-dashboard.model';
import { ParsedExcel } from '../models/parsed-excel.model';
import {
  resolveHeaders,
  resolveHeaderFuzzy,
  readCell,
} from '../utils/normalize-headers.util';

/**
 * Base abstracta para los renderers de stats. Encapsula la lógica común del
 * patrón Strategy + Registry canonizado en Sprint 6 (mismo espíritu que
 * `BaseSubmissionForm`): el flow `parse → getFilters → applyFilters` se
 * resuelve aquí, y cada renderer concreto solo declara qué columnas espera,
 * qué blacklist anti-PII aplica y cómo construye secciones/filtros con las
 * filas resueltas.
 *
 * La firma del contrato no pasa el workbook a `getFilters`/`applyFilters`,
 * así que la base guarda como state interno las filas y el headerMap del
 * último `parse()`; el flujo esperado desde la vista es `parse() →
 * getFilters() → applyFilters()` sin saltarse `parse`.
 *
 * Marcada con `@Directive()` para que Angular acepte un constructor con
 * inyección en las subclases sin que la base sea instanciable por sí sola.
 */
@Directive()
export abstract class BaseStatsRenderer implements StatsRenderer {
  protected latestRows: readonly Record<string, unknown>[] | null = null;
  protected latestHeaderMap: Record<string, string> | null = null;

  /**
   * Resiliente por contrato: si el Excel no calza con lo que el renderer
   * espera, devuelve `{ sections: [] }` en vez de lanzar. La vista pública
   * suprime el panel cuando no hay secciones; el visitante ve el header del
   * item sin un mensaje de error que delate al admin que el archivo está
   * mal armado.
   */
  parse(workbook: unknown): StatsDashboard {
    try {
      const excel = workbook as ParsedExcel;
      const sheet = excel.sheets[excel.sheetNames[0]];
      const headers = sheet.headers;
      const rows = sheet.rows;

      const headerMap = resolveHeaders(headers, this.getRequiredColumns());

      const fuzzy = this.getFuzzyColumns();
      for (const [logicalKey, fragments] of Object.entries(fuzzy)) {
        const physical = resolveHeaderFuzzy(headers, fragments);
        if (physical !== null) headerMap[logicalKey] = physical;
      }

      this.latestRows = rows;
      this.latestHeaderMap = headerMap;

      return { sections: this.buildSections(rows, headerMap) };
    } catch {
      this.latestRows = null;
      this.latestHeaderMap = null;
      return { sections: [] };
    }
  }

  getFilters(
    _dashboard: StatsDashboard,
    active: Record<string, string | string[]> = {},
  ): readonly FilterConfig[] {
    if (!this.latestRows || !this.latestHeaderMap) return [];
    const rows = this.latestRows;
    const headerMap = this.latestHeaderMap;
    return this.buildFilters(rows, headerMap).map((filter) =>
      filter.dependsOn ? this.narrowDependentFilter(filter, active, rows, headerMap) : filter,
    );
  }

  /**
   * Recalcula las opciones de un filtro dependiente con las filas que matchean
   * el valor activo de su filtro padre (cascada). Si el padre no tiene
   * selección, deja las opciones completas.
   */
  protected narrowDependentFilter(
    filter: FilterConfig,
    active: Record<string, string | string[]>,
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): FilterConfig {
    const parentKey = filter.dependsOn;
    if (!parentKey) return filter;

    const parentValue = active[parentKey];
    const parentTargets = Array.isArray(parentValue)
      ? parentValue
      : parentValue
        ? [parentValue]
        : [];
    if (parentTargets.length === 0) return filter;

    const parentColumn = headerMap[this.getFilterColumnKey(parentKey)];
    const ownColumn = headerMap[this.getFilterColumnKey(filter.key)];
    if (!parentColumn || !ownColumn) return filter;

    const parentSet = new Set(parentTargets);
    const scoped = rows.filter((row) => {
      const v = readCell(row, parentColumn);
      return typeof v === 'string' && parentSet.has(v);
    });
    return { ...filter, options: this.selectOptions(scoped, ownColumn) };
  }

  /**
   * Opciones de un filtro select: valores string distintos, no vacíos, de una
   * columna, ordenados. Lo comparten el armado inicial de los renderers y el
   * recorte de los filtros dependientes, así ambos derivan las mismas opciones.
   */
  protected selectOptions(
    rows: readonly Record<string, unknown>[],
    column: string | undefined,
  ): readonly FilterOption[] {
    if (!column) return [];
    const unique = new Set<string>();
    for (const row of rows) {
      const v = readCell(row, column);
      if (typeof v === 'string' && v.length > 0) unique.add(v);
    }
    return Array.from(unique)
      .sort()
      .map((value) => ({ value, label: value }));
  }

  applyFilters(
    dashboard: StatsDashboard,
    filters: Record<string, string | string[]>,
  ): StatsDashboard {
    if (!this.latestRows || !this.latestHeaderMap) return dashboard;
    const filtered = this.applyFiltersToRows(
      this.latestRows,
      filters,
      this.latestHeaderMap,
    );
    return { sections: this.buildSections(filtered, this.latestHeaderMap) };
  }

  /**
   * Filtrado por AND entre filtros activos: una fila pasa si para cada filtro
   * con valor el cell de su columna está en el set de targets. Soporta single
   * (`string`) y multi (`string[]`); valores vacíos o ausentes se ignoran.
   * El nombre lógico de la columna a usar se resuelve por
   * `getFilterColumnKey`, que default es identidad (el filterKey coincide con
   * la key lógica). Los renderers que usen filterKeys distintos al nombre de
   * la columna (e.g. `departamental` que mira `departamento_sede`) overrídeean
   * ese hook.
   */
  protected applyFiltersToRows(
    rows: readonly Record<string, unknown>[],
    filters: Record<string, string | string[]>,
    headerMap: Record<string, string>,
  ): readonly Record<string, unknown>[] {
    let current = rows;
    for (const [key, raw] of Object.entries(filters)) {
      const targets = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (targets.length === 0) continue;
      const column = headerMap[this.getFilterColumnKey(key)];
      if (!column) continue;
      const targetSet = new Set(targets);
      current = current.filter((row) => {
        const v = readCell(row, column);
        return typeof v === 'string' && targetSet.has(v);
      });
    }
    return current;
  }

  /**
   * Resuelve el filterKey al nombre lógico de la columna en `headerMap`. Por
   * default es identidad: los renderers donde el filterKey coincide con la
   * columna (e.g. Docentes con `departamentales`) no necesitan override.
   */
  protected getFilterColumnKey(filterKey: string): string {
    return filterKey;
  }

  /**
   * Keys lógicas de las columnas que el renderer espera en el Excel
   * (e.g. `['sexo', 'departamento']`). El matching contra los headers físicos
   * es case y whitespace insensitive vía `resolveHeaders`.
   */
  protected abstract getRequiredColumns(): readonly string[];

  /**
   * Construye las secciones del dashboard a partir de filas y headerMap. Lo
   * usa `parse()` con todas las filas y `applyFilters()` con las filas
   * filtradas, así ambos paths comparten la lógica.
   */
  protected abstract buildSections(
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): readonly ChartSection[];

  /**
   * Declara los filtros del dashboard. Las opciones se extraen del workbook
   * actual (no se hardcodean); cada renderer concreto decide qué columnas
   * funcionan como filtros y de qué tipo.
   */
  protected abstract buildFilters(
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): readonly FilterConfig[];

  /**
   * Columnas con matching fuzzy: la key lógica se mapea a una lista de
   * fragmentos que deben estar todos presentes en el header. Default vacío:
   * los renderers que no usan fuzzy no necesitan override.
   */
  protected getFuzzyColumns(): Record<string, readonly string[]> {
    return {};
  }
}
