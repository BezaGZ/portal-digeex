import { Directive } from '@angular/core';

import { StatsRenderer } from './stats-renderer.interface';
import {
  StatsDashboard,
  ChartSection,
  FilterConfig,
} from '../models/stats-dashboard.model';
import { ParsedExcel } from '../models/parsed-excel.model';
import {
  normalizeHeader,
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

  parse(workbook: unknown): StatsDashboard {
    const excel = workbook as ParsedExcel;
    const sheet = excel.sheets[excel.sheetNames[0]];
    const headers = sheet.headers;
    const rows = sheet.rows;

    // Guardia anti-PII: antes que nada, rechazar archivos con columnas identificatorias.
    const normalized = headers.map((h) => normalizeHeader(h));
    const forbidden = this.getForbiddenColumns();
    const piiFound = normalized.filter((h) => forbidden.includes(h));
    if (piiFound.length > 0) {
      throw new Error(
        `PII no permitido: el Excel contiene las columnas ${piiFound.join(', ')}.`,
      );
    }

    // Resolución de headers requeridos (matching exacto normalizado).
    const headerMap = resolveHeaders(headers, this.getRequiredColumns());

    // Resolución fuzzy opcional (e.g. columnas con encoding sospechoso).
    const fuzzy = this.getFuzzyColumns();
    for (const [logicalKey, fragments] of Object.entries(fuzzy)) {
      const physical = resolveHeaderFuzzy(headers, fragments);
      if (physical !== null) headerMap[logicalKey] = physical;
    }

    this.latestRows = rows;
    this.latestHeaderMap = headerMap;

    return { sections: this.buildSections(rows, headerMap) };
  }

  getFilters(_dashboard: StatsDashboard): readonly FilterConfig[] {
    if (!this.latestRows || !this.latestHeaderMap) return [];
    return this.buildFilters(this.latestRows, this.latestHeaderMap);
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
   * Lista negra de columnas en su forma normalizada (lowercase, trim). El
   * renderer concreto la declara y la base la aplica al inicio de `parse`.
   */
  abstract getForbiddenColumns(): readonly string[];

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
