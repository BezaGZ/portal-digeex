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

const REQUIRED = [
  'sexo',
  'departamento_sede',
  'municipio',
  'edad',
  'rango de edad',
  'tipo_discapacidad',
  'programa',
  'nivel',
  'area geografica',
  'resultado',
] as const;

/**
 * Renderer del dataset `estudiantes`. Construye diez secciones desde `Hoja1`
 * del Excel para reproducir el dashboard de PowerBI: tres KPIs (Mujer, Hombre,
 * Total de Estudiantes), pie de género, pie de rango de edad, histogram de
 * edad puntual, bar de comunidad lingüística (matching fuzzy por el encoding
 * sospechoso del header), bar de tipos de discapacidad, treemap de programas,
 * bar de nivel educativo, horizontal-bar de área geográfica y pie de
 * resultados. Dos filtros (`departamental`, `municipios`).
 */
@Injectable({ providedIn: 'root' })
export class EstudiantesRenderer extends BaseStatsRenderer {
  protected override getRequiredColumns(): readonly string[] {
    return REQUIRED;
  }

  /**
   * `comunidad linguistica` es la única columna con encoding sospechoso en el
   * Excel de DIGEEX (`COMUNIDAD LING¿ISTICA` donde la Ü se corrompió). Fuzzy
   * matching la encuentra hoy y resiste si DIGEEX mañana lo corrige a `Ü` o
   * a sin acento.
   */
  protected override getFuzzyColumns(): Record<string, readonly string[]> {
    return {
      'comunidad linguistica': ['comunidad', 'ling'],
    };
  }

  protected override buildSections(
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): readonly ChartSection[] {
    const sexoCol = headerMap['sexo'];
    const rangoEdadCol = headerMap['rango de edad'];
    const edadCol = headerMap['edad'];
    const comunidadCol = headerMap['comunidad linguistica'];
    const discapacidadCol = headerMap['tipo_discapacidad'];
    const programaCol = headerMap['programa'];
    const nivelCol = headerMap['nivel'];
    const areaCol = headerMap['area geografica'];
    const resultadoCol = headerMap['resultado'];

    let mujer = 0;
    let hombre = 0;
    let sinDiscapacidad = 0;
    const rangoEdadCount = new Map<string, number>();
    const edadCount = new Map<number, number>();
    const comunidadCount = new Map<string, number>();
    const discapacidadCount = new Map<string, number>();
    const programaCount = new Map<string, number>();
    const nivelCount = new Map<string, number>();
    const areaCount = new Map<string, number>();
    const resultadoCount = new Map<string, number>();

    for (const row of rows) {
      const sexo = String(readCell(row, sexoCol) ?? '').toUpperCase();
      if (sexo === 'MUJER') mujer++;
      else if (sexo === 'HOMBRE') hombre++;

      incrementString(rangoEdadCount, readCell(row, rangoEdadCol));

      const disc = readCell(row, discapacidadCol);
      if (typeof disc === 'string' && disc.length > 0) {
        if (disc.toUpperCase() === 'SIN DISCAPACIDAD') {
          sinDiscapacidad++;
        } else {
          discapacidadCount.set(disc, (discapacidadCount.get(disc) ?? 0) + 1);
        }
      }

      incrementString(programaCount, readCell(row, programaCol));
      incrementString(nivelCount, readCell(row, nivelCol));
      incrementString(areaCount, readCell(row, areaCol));
      incrementString(resultadoCount, readCell(row, resultadoCol));
      if (comunidadCol) incrementString(comunidadCount, readCell(row, comunidadCol));

      const edad = readCell(row, edadCol);
      if (typeof edad === 'number' && Number.isFinite(edad)) {
        edadCount.set(edad, (edadCount.get(edad) ?? 0) + 1);
      }
    }

    const sections: ChartSection[] = [
      {
        title: 'Indicadores',
        charts: [
          kpi('Mujer', mujer),
          kpi('Hombre', hombre),
          kpi('Total de Estudiantes', rows.length),
          kpi('Sin discapacidad', sinDiscapacidad),
        ],
      },
      {
        title: 'Distribución por género',
        charts: [
          {
            type: 'pie',
            title: 'Género',
            data: [
              { label: 'MUJER', value: mujer },
              { label: 'HOMBRE', value: hombre },
            ],
          },
        ],
      },
      {
        title: 'Distribución por rango de edad',
        charts: [
          { type: 'pie', title: 'Rango de Edad', data: sortDesc(mapToData(rangoEdadCount)) },
        ],
      },
      {
        title: 'Distribución por edad',
        charts: [
          { type: 'histogram', title: 'Edad', data: sortByNumericLabel(numericMapToData(edadCount)) },
        ],
      },
    ];

    if (comunidadCol) {
      sections.push({
        title: 'Comunidad lingüística',
        charts: [
          {
            type: 'bar',
            title: 'Comunidad lingüística',
            data: sortDesc(mapToData(comunidadCount)),
          },
        ],
      });
    }

    sections.push(
      {
        title: 'Tipos de discapacidad',
        charts: [
          {
            type: 'list',
            title: 'Tipos de discapacidad',
            data: sortDesc(mapToData(discapacidadCount)),
          },
        ],
      },
      {
        title: 'Programas',
        charts: [
          { type: 'treemap', title: 'Programas', data: sortDesc(mapToData(programaCount)) },
        ],
      },
      {
        title: 'Nivel educativo',
        charts: [
          { type: 'bar', title: 'Nivel', data: sortDesc(mapToData(nivelCount)) },
        ],
      },
      {
        title: 'Área geográfica',
        charts: [
          {
            type: 'horizontal-bar',
            title: 'Área geográfica',
            data: sortDesc(mapToData(areaCount)),
          },
        ],
      },
      {
        title: 'Resultados',
        charts: [
          { type: 'pie', title: 'Resultados', data: sortDesc(mapToData(resultadoCount)) },
        ],
      },
    );

    return sections;
  }

  protected override buildFilters(
    rows: readonly Record<string, unknown>[],
    headerMap: Record<string, string>,
  ): readonly FilterConfig[] {
    return [
      buildSelectFilter('departamental', 'Departamental', headerMap['departamento_sede'], rows),
      buildSelectFilter('municipios', 'Municipios', headerMap['municipio'], rows),
    ];
  }

  /**
   * El filtro `departamental` mira la columna lógica `departamento_sede` (el
   * dashboard de PowerBI etiqueta el dropdown como "Departamental" pero
   * agrupa por la sede de la DIDEDUC). `municipios` matchea con `municipio`.
   */
  protected override getFilterColumnKey(filterKey: string): string {
    switch (filterKey) {
      case 'departamental':
        return 'departamento_sede';
      case 'municipios':
        return 'municipio';
      default:
        return filterKey;
    }
  }
}

function kpi(title: string, value: number): ChartConfig {
  return { type: 'kpi', title, data: [{ label: title, value }] };
}

function mapToData(m: Map<string, number>): ChartDataPoint[] {
  return Array.from(m.entries()).map(([label, value]) => ({ label, value }));
}

function numericMapToData(m: Map<number, number>): ChartDataPoint[] {
  return Array.from(m.entries()).map(([label, value]) => ({ label: String(label), value }));
}

function sortDesc(data: ChartDataPoint[]): ChartDataPoint[] {
  return [...data].sort((a, b) => b.value - a.value);
}

function sortByNumericLabel(data: ChartDataPoint[]): ChartDataPoint[] {
  return [...data].sort((a, b) => Number(a.label) - Number(b.label));
}

function incrementString(map: Map<string, number>, value: unknown): void {
  if (typeof value === 'string' && value.length > 0) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
}

function buildSelectFilter(
  key: string,
  label: string,
  column: string | undefined,
  rows: readonly Record<string, unknown>[],
): FilterConfig {
  const options: { value: string; label: string }[] = [];
  if (column) {
    const unique = new Set<string>();
    for (const row of rows) {
      const v = readCell(row, column);
      if (typeof v === 'string' && v.length > 0) unique.add(v);
    }
    for (const v of Array.from(unique).sort()) options.push({ value: v, label: v });
  }
  return { key, label, type: 'select', options };
}

registerStatsRenderer('estudiantes', EstudiantesRenderer);
