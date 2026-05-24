import { Injectable } from '@angular/core';

import { BaseStatsRenderer } from './base-stats-renderer';
import {
  ChartSection,
  ChartConfig,
  ChartDataPoint,
  FilterConfig,
} from '../models/stats-dashboard.model';
import { registerStatsRenderer } from '../stats-dataset-registry';
import { readCell } from '../utils/normalize-headers.util';

const REQUIRED = ['sexo', 'departamento', 'departamentales', 'contrato', 'programa'] as const;

/**
 * Renderer del dataset `docentes`. Construye cuatro secciones desde `Hoja1`
 * del Excel: tres KPIs de género (FEMENINO / MASCULINO / Total), pie de sexo,
 * bar de tipo de contrato y horizontal-bar de programas. Filtro
 * `departamentales` (single-select) que reconstruye el dashboard con las
 * filas que matchean. Auto-registrado bajo `docentes` en
 * `stats-dataset-registry` para que la vista pública lo resuelva por
 * `digeex.statsDataset`.
 */
@Injectable({ providedIn: 'root' })
export class DocentesRenderer extends BaseStatsRenderer {
  protected override getRequiredColumns(): readonly string[] {
    return REQUIRED;
  }

  protected override buildSections(
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): readonly ChartSection[] {
    const sexoCol = headerMap['sexo'];
    const contratoCol = headerMap['contrato'];
    const programaCol = headerMap['programa'];
    const departamentoCol = headerMap['departamento'];

    let femenino = 0;
    let masculino = 0;
    const contratoCount = new Map<string, number>();
    const programaCount = new Map<string, number>();
    const departamentoCount = new Map<string, number>();

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
      const departamento = readCell(row, departamentoCol);
      if (typeof departamento === 'string' && departamento.length > 0) {
        departamentoCount.set(departamento, (departamentoCount.get(departamento) ?? 0) + 1);
      }
    }

    return [
      {
        title: 'Indicadores',
        charts: [
          kpi('Técnicas Docentes', femenino),
          kpi('Técnicos Docentes', masculino),
          kpi('Total de Técnicos', rows.length),
        ],
      },
      {
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
      },
      {
        title: 'Distribución por tipo de contrato',
        widthHint: 'wide',
        charts: [
          { type: 'horizontal-bar', title: 'Tipos de contrato', data: sortDesc(mapToData(contratoCount)) },
        ],
      },
      {
        title: 'Programas registrados',
        widthHint: 'wide',
        charts: [
          {
            type: 'tags',
            title: 'Programas',
            data: sortDesc(mapToData(programaCount)),
          },
        ],
      },
      {
        title: 'Distribución geográfica',
        widthHint: 'wide',
        charts: [
          { type: 'map', title: 'Técnicos por departamento', data: mapToData(departamentoCount) },
        ],
      },
    ];
  }

  protected override buildFilters(
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): readonly FilterConfig[] {
    const col = headerMap['departamentales'];
    const unique = new Set<string>();
    for (const row of rows) {
      const v = readCell(row, col);
      if (typeof v === 'string' && v.length > 0) unique.add(v);
    }
    return [
      {
        key: 'departamentales',
        label: 'Departamentales',
        type: 'select',
        options: Array.from(unique)
          .sort()
          .map((v) => ({ value: v, label: v })),
      },
    ];
  }
}

function kpi(title: string, value: number): ChartConfig {
  return { type: 'kpi', title, data: [{ label: title, value }] };
}

function mapToData(m: Map<string, number>): ChartDataPoint[] {
  return Array.from(m.entries()).map(([label, value]) => ({ label, value }));
}

function sortDesc(data: ChartDataPoint[]): ChartDataPoint[] {
  return [...data].sort((a, b) => b.value - a.value);
}

registerStatsRenderer('docentes', DocentesRenderer);
