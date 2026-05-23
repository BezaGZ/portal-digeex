import { TestBed } from '@angular/core/testing';

import { EstudiantesRenderer } from './estudiantes-renderer';
import { getStatsRenderer } from '../stats-dataset-registry';
import { ParsedExcel } from '../models/parsed-excel.model';
import { ChartConfig, ChartSection } from '../models/stats-dashboard.model';

/**
 * Tests del `EstudiantesRenderer`.
 *
 * Renderer del dataset `estudiantes`. Lee `Hoja1` del Excel con 21 columnas y
 * construye un `StatsDashboard` con diez secciones replicando el dashboard de
 * PowerBI de DIGEEX: tres KPIs de género (MUJER/HOMBRE/Total), pie de
 * género, pie de rango de edad, histogram de edad, bar de comunidad
 * lingüística (matching fuzzy por el encoding sospechoso del header `LING¿`),
 * bar de tipos de discapacidad, treemap de programas, bar de nivel,
 * horizontal-bar de área geográfica y pie de resultados. Dos filtros
 * (`departamental` y `municipios`) que reconstruyen el dashboard al
 * aplicarlos. Auto-registrado bajo `estudiantes` en `stats-dataset-registry`.
 *
 * Ciclo 9 TDD — Sprint 7.
 */

const HEADERS = [
  'DEPARTAMENTO_SEDE',
  'DEPARTAMENTO',
  'MUNICIPIO',
  'EDAD',
  'SEXO',
  'COMUNIDAD LING¿ISTICA',
  'PROGRAMA',
  'NIVEL',
  'MODALIDAD',
  'TIPO_DISCAPACIDAD',
  'RESULTADO',
  'AREA GEOGRAFICA',
  'Rango de Edad',
];

function row(opts: {
  sexo: string;
  depSede: string;
  municipio: string;
  edad: number;
  comunidad: string;
  programa: string;
  nivel: string;
  discapacidad: string;
  resultado: string;
  area: string;
  rangoEdad: string;
}): Record<string, unknown> {
  return {
    DEPARTAMENTO_SEDE: opts.depSede,
    DEPARTAMENTO: opts.depSede.replace('DIDEDUC DE ', '').trim(),
    MUNICIPIO: opts.municipio,
    EDAD: opts.edad,
    SEXO: opts.sexo,
    'COMUNIDAD LING¿ISTICA': opts.comunidad,
    PROGRAMA: opts.programa,
    NIVEL: opts.nivel,
    MODALIDAD: 'PRESENCIAL',
    TIPO_DISCAPACIDAD: opts.discapacidad,
    RESULTADO: opts.resultado,
    'AREA GEOGRAFICA': opts.area,
    'Rango de Edad': opts.rangoEdad,
  };
}

const SAMPLE_ROWS: Record<string, unknown>[] = [
  row({
    sexo: 'MUJER',
    depSede: 'DIDEDUC DE GUATEMALA',
    municipio: 'GUATEMALA',
    edad: 18,
    comunidad: 'LADINO',
    programa: 'MODALIDADES FLEXIBLES',
    nivel: 'BÁSICO',
    discapacidad: 'SIN DISCAPACIDAD',
    resultado: 'EN PROCESO',
    area: 'URBANA',
    rangoEdad: '13-30 años',
  }),
  row({
    sexo: 'MUJER',
    depSede: 'DIDEDUC DE ALTA VERAPAZ',
    municipio: 'CHAHAL',
    edad: 27,
    comunidad: 'MAYA',
    programa: 'MODALIDADES FLEXIBLES',
    nivel: 'DIVERSIFICADO',
    discapacidad: 'SIN DISCAPACIDAD',
    resultado: 'PROMOVIDO',
    area: 'RURAL',
    rangoEdad: '13-30 años',
  }),
  row({
    sexo: 'HOMBRE',
    depSede: 'DIDEDUC DE GUATEMALA',
    municipio: 'GUATEMALA',
    edad: 35,
    comunidad: 'LADINO',
    programa: 'PRONEA',
    nivel: 'PRIMARIA',
    discapacidad: 'DISCAPACIDAD AUDITIVA',
    resultado: 'EN PROCESO',
    area: 'URBANA',
    rangoEdad: '31-60 años',
  }),
  row({
    sexo: 'HOMBRE',
    depSede: 'DIDEDUC DE ALTA VERAPAZ',
    municipio: 'COBAN',
    edad: 20,
    comunidad: 'MAYA',
    programa: 'CEMUCAF',
    nivel: 'CURSOS LIBRES',
    discapacidad: 'SIN DISCAPACIDAD',
    resultado: 'EN PROCESO',
    area: 'RURAL',
    rangoEdad: '13-30 años',
  }),
  row({
    sexo: 'MUJER',
    depSede: 'DIDEDUC DE GUATEMALA',
    municipio: 'MIXCO',
    edad: 16,
    comunidad: 'LADINO',
    programa: 'MODALIDADES FLEXIBLES',
    nivel: 'BÁSICO',
    discapacidad: 'SIN DISCAPACIDAD',
    resultado: 'EN PROCESO',
    area: 'URBANA',
    rangoEdad: '13-30 años',
  }),
];

function buildExcel(
  rows: Record<string, unknown>[] = SAMPLE_ROWS,
  headers: string[] = HEADERS,
): ParsedExcel {
  return {
    sheetNames: ['Hoja1'],
    sheets: { Hoja1: { headers, rows } },
  };
}

function findSection(sections: readonly ChartSection[], title: string): ChartSection {
  const found = sections.find((s) => s.title === title);
  if (!found) throw new Error(`Section not found: ${title}`);
  return found;
}

function findChart(charts: readonly ChartConfig[], title: string): ChartConfig {
  const found = charts.find((c) => c.title === title);
  if (!found) throw new Error(`Chart not found: ${title}`);
  return found;
}

describe('EstudiantesRenderer', () => {
  let renderer: EstudiantesRenderer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    renderer = TestBed.inject(EstudiantesRenderer);
  });

  /** El renderer se auto-registra bajo la clave `estudiantes` al cargarse el módulo. */
  it('should auto-register itself under the "estudiantes" dataset key', () => {
    expect(getStatsRenderer('estudiantes')).toBe(EstudiantesRenderer);
  });

  /** La blacklist anti-PII normalizada incluye los identificadores estándar. */
  it('should expose the normalized PII blacklist via getForbiddenColumns', () => {
    expect(renderer.getForbiddenColumns()).toEqual(
      expect.arrayContaining(['nombres', 'apellidos', 'dpi', 'cui', 'telefono', 'correo']),
    );
  });

  /** parse() lanza si el Excel trae una columna en la blacklist anti-PII. */
  it('should throw when the workbook contains a PII column', () => {
    const wb = buildExcel(SAMPLE_ROWS, [...HEADERS, 'Nombres']);
    expect(() => renderer.parse(wb)).toThrow(/PII/i);
  });

  /** parse() lanza si falta una columna requerida. */
  it('should throw when a required column is missing', () => {
    const headersSinSexo = HEADERS.filter((h) => h !== 'SEXO');
    expect(() => renderer.parse(buildExcel(SAMPLE_ROWS, headersSinSexo))).toThrow(/sexo/i);
  });

  /** Tres KPIs en Indicadores: Mujer, Hombre y Total de Estudiantes. */
  it('should build the Indicadores section with three KPI cards', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Indicadores');

    expect(section.charts.length).toBe(3);
    expect(section.charts.every((c) => c.type === 'kpi')).toBe(true);

    const mujer = findChart(section.charts, 'Mujer');
    const hombre = findChart(section.charts, 'Hombre');
    const total = findChart(section.charts, 'Total de Estudiantes');

    expect(mujer.data[0].value).toBe(3);
    expect(hombre.data[0].value).toBe(2);
    expect(total.data[0].value).toBe(5);
  });

  /** Pie de género con MUJER y HOMBRE. */
  it('should build the pie chart of género with MUJER and HOMBRE counts', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Distribución por género');
    const pie = section.charts[0];

    expect(pie.type).toBe('pie');
    expect(pie.data).toEqual(
      expect.arrayContaining([
        { label: 'MUJER', value: 3 },
        { label: 'HOMBRE', value: 2 },
      ]),
    );
  });

  /** Histogram de edad con cada edad puntual contada. */
  it('should build the histogram of edad with one bucket per distinct age', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Distribución por edad');
    const histogram = section.charts[0];

    expect(histogram.type).toBe('histogram');
    // SAMPLE_ROWS edades: 16, 18, 20, 27, 35 → 5 buckets distintos.
    expect(histogram.data.length).toBe(5);
    // El label se almacena como string para el modelo ChartDataPoint.
    expect(histogram.data.map((d) => d.label)).toEqual(['16', '18', '20', '27', '35']);
  });

  /** Comunidad lingüística matchea por fuzzy (header con `¿` corrompido). */
  it('should resolve the comunidad lingüística column via fuzzy matching despite the encoding', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Comunidad lingüística');
    const bar = section.charts[0];

    expect(bar.type).toBe('bar');
    expect(bar.data.find((d) => d.label === 'LADINO')!.value).toBe(3);
    expect(bar.data.find((d) => d.label === 'MAYA')!.value).toBe(2);
  });

  /** Treemap de programas con conteo por valor único. */
  it('should build the treemap of programas with counts per program', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Programas');
    const treemap = section.charts[0];

    expect(treemap.type).toBe('treemap');
    expect(treemap.data.find((d) => d.label === 'MODALIDADES FLEXIBLES')!.value).toBe(3);
    expect(treemap.data.find((d) => d.label === 'PRONEA')!.value).toBe(1);
    expect(treemap.data.find((d) => d.label === 'CEMUCAF')!.value).toBe(1);
  });

  /** Horizontal-bar de área geográfica con URBANA y RURAL. */
  it('should build the horizontal-bar of área geográfica', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Área geográfica');
    const bar = section.charts[0];

    expect(bar.type).toBe('horizontal-bar');
    expect(bar.data.find((d) => d.label === 'URBANA')!.value).toBe(3);
    expect(bar.data.find((d) => d.label === 'RURAL')!.value).toBe(2);
  });

  /** Filtros declarativos: departamental + municipios, ambos single-select con opciones únicas. */
  it('should expose two single-select filters (departamental + municipios) with unique options', () => {
    const dashboard = renderer.parse(buildExcel());
    const filters = renderer.getFilters(dashboard);

    expect(filters.length).toBe(2);
    expect(filters.map((f) => f.key)).toEqual(['departamental', 'municipios']);
    expect(filters[0].options.map((o) => o.value)).toEqual(
      expect.arrayContaining(['DIDEDUC DE GUATEMALA', 'DIDEDUC DE ALTA VERAPAZ']),
    );
    expect(filters[1].options.map((o) => o.value)).toEqual(
      expect.arrayContaining(['GUATEMALA', 'CHAHAL', 'COBAN', 'MIXCO']),
    );
  });

  /** applyFilters por departamental reconstruye todas las secciones con solo las filas que matchean. */
  it('should rebuild the dashboard filtered by departamental', () => {
    const original = renderer.parse(buildExcel());
    const filtered = renderer.applyFilters(original, {
      departamental: 'DIDEDUC DE GUATEMALA',
    });

    const indicadores = findSection(filtered.sections, 'Indicadores');
    expect(findChart(indicadores.charts, 'Total de Estudiantes').data[0].value).toBe(3);
    expect(findChart(indicadores.charts, 'Mujer').data[0].value).toBe(2);
    expect(findChart(indicadores.charts, 'Hombre').data[0].value).toBe(1);
  });

  /** Filtros combinados AND: departamental + municipios reduce más el dashboard. */
  it('should apply multiple active filters with AND semantics', () => {
    const original = renderer.parse(buildExcel());
    const filtered = renderer.applyFilters(original, {
      departamental: 'DIDEDUC DE GUATEMALA',
      municipios: 'MIXCO',
    });

    const total = findChart(
      findSection(filtered.sections, 'Indicadores').charts,
      'Total de Estudiantes',
    ).data[0].value;
    expect(total).toBe(1);
  });
});
