import { Injectable } from '@angular/core';

import { StatsRenderer } from './stats-renderer.interface';
import {
  StatsDashboard,
  ChartSection,
  ChartConfig,
  ChartDataPoint,
  FilterConfig,
} from '../models/stats-dashboard.model';
import { ParsedExcel } from '../models/parsed-excel.model';
import { registerStatsRenderer } from '../stats-dataset-registry';
import { normalizeHeader, resolveHeaders, readCell } from '../utils/normalize-headers.util';

/**
 * Columnas lógicas que el Excel debe tener (en su forma normalizada). El
 * matching contra los headers físicos del archivo es case y whitespace
 * insensitive vía `normalize-headers.util`.
 */
const REQUIRED_LOGICAL = ['sexo', 'departamento', 'departamentales', 'contrato', 'programa'] as const;

/**
 * Blacklist anti-PII: identificadores individuales que no deben aparecer en
 * el Excel de un dataset agregado. Si el archivo trae alguna, `parse()`
 * cancela el procesamiento con un mensaje claro al admin.
 */
const FORBIDDEN_COLUMNS = ['nombres', 'apellidos', 'dpi', 'cui', 'telefono', 'correo', 'email'] as const;

/**
 * Renderer del dataset `docentes`.
 *
 * Lee `Hoja1` del Excel del item y construye un `StatsDashboard` con cuatro
 * secciones: KPIs de género (3 cards), distribución por sexo (pie),
 * distribución por tipo de contrato (bar desc) y programas registrados
 * (horizontal-bar desc). El filtro `departamentales` permite re-renderizar
 * el dashboard con solo el subconjunto seleccionado.
 *
 * Como `getFilters` y `applyFilters` no reciben el workbook en su firma
 * (solo el dashboard), el renderer guarda el último `ParsedExcel` parseado
 * como state interno. Cada `parse()` resetea ese state; el flujo esperado
 * desde la vista es `parse() → getFilters() → applyFilters()` para un mismo
 * item.
 */
@Injectable({ providedIn: 'root' })
export class DocentesRenderer implements StatsRenderer {
  private latestParsed: ParsedExcel | null = null;
  private latestHeaderMap: Record<string, string> | null = null;

  parse(workbook: unknown): StatsDashboard {
    const excel = workbook as ParsedExcel;
    const sheetName = excel.sheetNames[0];
    const sheet = excel.sheets[sheetName];
    const headers = sheet.headers;
    const rows = sheet.rows;

    // Guardia anti-PII: antes que nada, rechazar archivos con columnas identificatorias.
    const normalized = headers.map((h) => normalizeHeader(h));
    const piiFound = normalized.filter((h) =>
      (FORBIDDEN_COLUMNS as readonly string[]).includes(h),
    );
    if (piiFound.length > 0) {
      throw new Error(
        `PII no permitido: el Excel contiene las columnas ${piiFound.join(', ')}.`,
      );
    }

    // Validación de columnas requeridas: si falta alguna, `resolveHeaders` lanza con la lista.
    const headerMap = resolveHeaders(headers, REQUIRED_LOGICAL);

    this.latestParsed = excel;
    this.latestHeaderMap = headerMap;

    return this.buildDashboardFromRows(rows, headerMap);
  }

  getFilters(_dashboard: StatsDashboard): readonly FilterConfig[] {
    if (!this.latestParsed || !this.latestHeaderMap) return [];
    const sheet = this.latestParsed.sheets[this.latestParsed.sheetNames[0]];
    const departamentalesCol = this.latestHeaderMap['departamentales'];

    const unique = new Set<string>();
    for (const row of sheet.rows) {
      const value = readCell(row, departamentalesCol);
      if (typeof value === 'string' && value.length > 0) unique.add(value);
    }

    const options = Array.from(unique)
      .sort()
      .map((v) => ({ value: v, label: v }));

    return [
      { key: 'departamentales', label: 'Departamentales', type: 'select', options },
    ];
  }

  applyFilters(
    dashboard: StatsDashboard,
    filters: Record<string, string | string[]>,
  ): StatsDashboard {
    if (!this.latestParsed || !this.latestHeaderMap) return dashboard;

    const raw = filters['departamentales'];
    const targets = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (targets.length === 0) return dashboard;

    const targetSet = new Set(targets);
    const sheet = this.latestParsed.sheets[this.latestParsed.sheetNames[0]];
    const departamentalesCol = this.latestHeaderMap['departamentales'];
    const filtered = sheet.rows.filter((row) => {
      const value = readCell(row, departamentalesCol);
      return typeof value === 'string' && targetSet.has(value);
    });

    return this.buildDashboardFromRows(filtered, this.latestHeaderMap);
  }

  getForbiddenColumns(): readonly string[] {
    return FORBIDDEN_COLUMNS;
  }

  /**
   * Construye el dashboard desde una colección arbitraria de filas. Se llama
   * desde `parse()` (con todas las filas) y desde `applyFilters()` (con las
   * filas que matchean el filtro activo); ambos paths comparten lógica.
   */
  private buildDashboardFromRows(
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): StatsDashboard {
    const sexoCol = headerMap['sexo'];
    const contratoCol = headerMap['contrato'];
    const programaCol = headerMap['programa'];

    let femenino = 0;
    let masculino = 0;
    const contratoCount = new Map<string, number>();
    const programaCount = new Map<string, number>();

    for (const row of rows) {
      const sexo = String(readCell(row, sexoCol) ?? '').toUpperCase();
      if (sexo === 'FEMENINO') femenino++;
      else if (sexo === 'MASCULINO') masculino++;

      const contrato = readCell(row, contratoCol);
      if (typeof contrato === 'string' && contrato.length > 0) {
        contratoCount.set(contrato, (contratoCount.get(contrato) ?? 0) + 1);
      }

      const programa = readCell(row, programaCol);
      if (typeof programa === 'string' && programa.length > 0) {
        programaCount.set(programa, (programaCount.get(programa) ?? 0) + 1);
      }
    }

    const indicadores: ChartSection = {
      title: 'Indicadores',
      charts: [
        kpi('Técnicas Docentes', femenino),
        kpi('Técnicos Docentes', masculino),
        kpi('Total de Técnicos', rows.length),
      ],
    };

    const sexo: ChartSection = {
      title: 'Distribución por sexo',
      charts: [
        {
          type: 'pie',
          title: 'Sexo',
          data: [
            { label: 'FEMENINO', value: femenino },
            { label: 'MASCULINO', value: masculino },
          ],
        },
      ],
    };

    const contrato: ChartSection = {
      title: 'Distribución por tipo de contrato',
      charts: [
        {
          type: 'bar',
          title: 'Tipos de contrato',
          data: sortDesc(mapToData(contratoCount)),
        },
      ],
    };

    const programa: ChartSection = {
      title: 'Programas registrados',
      charts: [
        {
          type: 'horizontal-bar',
          title: 'Programas',
          data: sortDesc(mapToData(programaCount)),
        },
      ],
    };

    return { sections: [indicadores, sexo, contrato, programa] };
  }
}

function kpi(title: string, value: number): ChartConfig {
  return {
    type: 'kpi',
    title,
    data: [{ label: title, value }],
  };
}

function mapToData(m: Map<string, number>): ChartDataPoint[] {
  return Array.from(m.entries()).map(([label, value]) => ({ label, value }));
}

function sortDesc(data: ChartDataPoint[]): ChartDataPoint[] {
  return [...data].sort((a, b) => b.value - a.value);
}

registerStatsRenderer('docentes', DocentesRenderer);
