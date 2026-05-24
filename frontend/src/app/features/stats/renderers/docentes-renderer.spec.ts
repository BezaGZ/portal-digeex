import { TestBed } from '@angular/core/testing';

import { DocentesRenderer } from './docentes-renderer';
import { getStatsRenderer } from '../stats-dataset-registry';
import { ParsedExcel } from '../models/parsed-excel.model';
import { ChartConfig, ChartSection } from '../models/stats-dashboard.model';

/**
 * Tests del `DocentesRenderer`.
 *
 * Renderer del dataset `docentes`. Lee `Hoja1` del Excel del item con los
 * headers `Sexo`, `Departamento`, `Departamentales`, `Contrato`, `Programa`
 * (matching case y whitespace insensitive vía `normalize-headers.util`) y
 * construye un `StatsDashboard` con cuatro secciones: KPIs de género,
 * distribución por sexo (pie), distribución por tipo de contrato (bar) y
 * programas registrados (horizontal-bar). Auto-registrado bajo la clave
 * `docentes` en `stats-dataset-registry`. Guardia anti-PII rechaza el
 * workbook si trae columnas como `Nombres`, `Apellidos`, `DPI`, `CUI`,
 * `Teléfono` o `Correo`. `applyFilters` filtra por `departamentales` y
 * reconstruye el dashboard con las filas que matchean.
 *
 * Ciclo 8 TDD — Sprint 7.
 */

const HEADERS = ['Sexo', 'Departamento', 'Departamentales', 'Contrato  ', 'Programa'];

function row(
  sexo: string,
  dep: string,
  departamentales: string,
  contrato: string,
  programa: string,
): Record<string, unknown> {
  return {
    Sexo: sexo,
    Departamento: dep,
    Departamentales: departamentales,
    'Contrato  ': contrato,
    Programa: programa,
  };
}

const SAMPLE_ROWS: Record<string, unknown>[] = [
  row('FEMENINO', ' QUETZALTENANGO', 'DIDEDUC DE QUETZALTENANGO', 'TECNICO ITINERANTE', 'PEAC'),
  row('FEMENINO', ' GUATEMALA', 'DIDEDUC DE GUATEMALA', 'TECNICO ITINERANTE', 'CEMUCAF'),
  row('MASCULINO', ' GUATEMALA', 'DIDEDUC DE GUATEMALA', 'TECNICO PRONEA', 'PRONEA'),
  row('MASCULINO', ' QUETZALTENANGO', 'DIDEDUC DE QUETZALTENANGO', 'TECNICO DE EDUCACION II', 'PEAC'),
  row('FEMENINO', ' GUATEMALA', 'DIDEDUC DE GUATEMALA', 'TECNICO PRONEA', 'PRONEA'),
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

describe('DocentesRenderer', () => {
  let renderer: DocentesRenderer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    renderer = TestBed.inject(DocentesRenderer);
  });

  /** El renderer se auto-registra bajo la clave `docentes` al cargarse el módulo. */
  it('should auto-register itself under the "docentes" dataset key', () => {
    expect(getStatsRenderer('docentes')).toBe(DocentesRenderer);
  });

  /**
   * Si faltan columnas requeridas (e.g. el Excel viene sin `Sexo`), `parse`
   * devuelve un dashboard sin secciones en vez de lanzar. La vista pública
   * suprime el panel y el visitante no ve un error feo.
   */
  it('should return an empty dashboard when a required column is missing', () => {
    const wb = buildExcel(SAMPLE_ROWS, ['Departamento', 'Departamentales', 'Contrato  ', 'Programa']);

    expect(renderer.parse(wb).sections).toEqual([]);
  });

  /** Sección "Indicadores" con tres KPIs: femeninas, masculinos y total general. */
  it('should build the Indicadores section with three KPI cards', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Indicadores');

    expect(section.charts.every((c) => c.type === 'kpi')).toBe(true);
    expect(section.charts.length).toBe(3);

    const femeninas = findChart(section.charts, 'Técnicas Docentes');
    const masculinos = findChart(section.charts, 'Técnicos Docentes');
    const total = findChart(section.charts, 'Total de Técnicos');

    expect(femeninas.data[0].value).toBe(3);
    expect(masculinos.data[0].value).toBe(2);
    expect(total.data[0].value).toBe(5);
  });

  /** Sección "Distribución por sexo" con un pie chart de FEMENINO vs MASCULINO. */
  it('should build the pie chart of Sexo with female and male counts', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Distribución por sexo');

    expect(section.charts.length).toBe(1);
    const pie = section.charts[0];
    expect(pie.type).toBe('pie');
    expect(pie.data).toEqual(
      expect.arrayContaining([
        { label: 'FEMENINO', value: 3 },
        { label: 'MASCULINO', value: 2 },
      ]),
    );
  });

  /**
   * Sección "Distribución por tipo de contrato" con horizontal-bar ordenado
   * desc. Es horizontal porque los nombres de contrato son largos (e.g.
   * "TECNICO ITINERANTE DE EDUCACION EXTRAESCOLAR") y en vertical el eje X
   * se aplasta y los labels se vuelven ilegibles.
   */
  it('should build the horizontal-bar chart of Contrato ordered desc by count', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Distribución por tipo de contrato');

    expect(section.charts.length).toBe(1);
    const bar = section.charts[0];
    expect(bar.type).toBe('horizontal-bar');
    // En SAMPLE_ROWS: TECNICO ITINERANTE x2, TECNICO PRONEA x2, TECNICO DE EDUCACION II x1.
    expect(bar.data[0].value).toBeGreaterThanOrEqual(bar.data[bar.data.length - 1].value);
    expect(bar.data.find((d) => d.label === 'TECNICO ITINERANTE')!.value).toBe(2);
    expect(bar.data.find((d) => d.label === 'TECNICO PRONEA')!.value).toBe(2);
    expect(bar.data.find((d) => d.label === 'TECNICO DE EDUCACION II')!.value).toBe(1);
  });

  /**
   * Sección "Programas registrados" con tags y widthHint `wide`: los
   * programas se ven como tarjetas azules en una franja horizontal, sin
   * conteo, replicando la banda inferior del dashboard de PowerBI de DIGEEX.
   */
  it('should build the tags chart of Programa as a wide section', () => {
    const dashboard = renderer.parse(buildExcel());
    const section = findSection(dashboard.sections, 'Programas registrados');

    expect(section.widthHint).toBe('wide');
    expect(section.charts.length).toBe(1);
    const tags = section.charts[0];
    expect(tags.type).toBe('tags');
    expect(tags.data.find((d) => d.label === 'PEAC')).toBeDefined();
    expect(tags.data.find((d) => d.label === 'PRONEA')).toBeDefined();
    expect(tags.data.find((d) => d.label === 'CEMUCAF')).toBeDefined();
  });

  /** getFilters expone un select `departamentales` con las opciones únicas extraídas del Excel. */
  it('should expose a "departamentales" select filter with the unique values from the workbook', () => {
    const dashboard = renderer.parse(buildExcel());
    const filters = renderer.getFilters(dashboard);

    expect(filters.length).toBe(1);
    expect(filters[0].key).toBe('departamentales');
    expect(filters[0].type).toBe('select');
    const values = filters[0].options.map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining(['DIDEDUC DE QUETZALTENANGO', 'DIDEDUC DE GUATEMALA']),
    );
  });

  /** applyFilters reconstruye el dashboard con solo las filas que matchean el filtro. */
  it('should rebuild the dashboard filtering rows by the active departamentales value', () => {
    const original = renderer.parse(buildExcel());
    const filtered = renderer.applyFilters(original, {
      departamentales: 'DIDEDUC DE GUATEMALA',
    });

    // En GUATEMALA: 2 FEMENINOS + 1 MASCULINO = 3 filas.
    const indicadores = findSection(filtered.sections, 'Indicadores');
    expect(findChart(indicadores.charts, 'Total de Técnicos').data[0].value).toBe(3);
    expect(findChart(indicadores.charts, 'Técnicas Docentes').data[0].value).toBe(2);
    expect(findChart(indicadores.charts, 'Técnicos Docentes').data[0].value).toBe(1);
  });

  /** Headers en cualquier case (SEXO, sexo, Sexo) y datos con whitespace se normalizan al parsear. */
  it('should parse workbooks with non-canonical header case and whitespace-padded values', () => {
    const headers = ['SEXO', 'departamento', 'DEPARTAMENTALES', '  contrato', 'Programa  '];
    const rows: Record<string, unknown>[] = [
      {
        SEXO: 'FEMENINO',
        departamento: 'GUATEMALA',
        DEPARTAMENTALES: ' DIDEDUC DE GUATEMALA',
        '  contrato': 'TECNICO ITINERANTE',
        'Programa  ': 'PEAC',
      },
    ];
    const dashboard = renderer.parse(buildExcel(rows, headers));
    const indicadores = findSection(dashboard.sections, 'Indicadores');

    expect(findChart(indicadores.charts, 'Total de Técnicos').data[0].value).toBe(1);
  });
});
