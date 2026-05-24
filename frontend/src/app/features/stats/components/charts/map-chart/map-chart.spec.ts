import { TestBed } from '@angular/core/testing';

import { MapChartComponent } from './map-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `MapChartComponent`.
 *
 * Mapa coroplético de los 22 departamentos de Guatemala con
 * `chartjs-chart-geo`. Carga el TopoJSON de minfin-bi vía import estático.
 *
 * Ciclo 15 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'map',
  title: 'Distribución geográfica',
  data: [
    { label: 'GUATEMALA', value: 4520 },
    { label: 'QUETZALTENANGO', value: 1830 },
    { label: 'SACATEPEQUEZ', value: 450 },
    { label: 'ALTA VERAPAZ', value: 990 },
  ],
};

describe('MapChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapChartComponent] });
  });

  /** Verifica que produzca una entrada por feature del TopoJSON (22) con el value matcheado por nombre normalizado. */
  it('should produce one data entry per topojson feature with the value matched from ChartConfig by normalized name', () => {
    const fixture = TestBed.createComponent(MapChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const ds = c.chartData().datasets[0];
    expect(ds.data.length).toBe(22);

    const guatemala = ds.data.find(
      (d) => d.feature.properties.Departamento === 'Guatemala',
    );
    expect(guatemala?.value).toBe(4520);

    const sacatepequez = ds.data.find(
      (d) => d.feature.properties.Departamento === 'Sacatepéquez',
    );
    expect(sacatepequez?.value).toBe(450);

    const altaVerapaz = ds.data.find(
      (d) => d.feature.properties.Departamento === 'Alta Verapaz',
    );
    expect(altaVerapaz?.value).toBe(990);
  });

  /**
   * Verifica que asigne 0 a features sin fila en `ChartConfig.data`.
   * Mantiene la silueta completa del país en lugar de dejar huecos.
   */
  it('should assign zero to features without a matching row in ChartConfig.data', () => {
    const fixture = TestBed.createComponent(MapChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const ds = c.chartData().datasets[0];
    const peten = ds.data.find(
      (d) => d.feature.properties.Departamento === 'Petén',
    );
    expect(peten?.value).toBe(0);

    const zacapa = ds.data.find(
      (d) => d.feature.properties.Departamento === 'Zacapa',
    );
    expect(zacapa?.value).toBe(0);
  });

  /** Verifica que configure Mercator + color scale en el eje x y oculte la legend del plugin. */
  it('should configure Mercator projection and a color scale on the x axis', () => {
    const fixture = TestBed.createComponent(MapChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.chartOptions.scales.projection.axis).toBe('x');
    expect(c.chartOptions.scales.projection.projection).toBe('mercator');
    expect(c.chartOptions.scales.color.axis).toBe('x');
    expect(c.chartOptions.plugins.legend.display).toBe(false);
  });

  /** Verifica que `sortedRows` ordene desc por value para la lista lateral del mapa. */
  it('should expose sortedRows in descending order by value for the side list', () => {
    const fixture = TestBed.createComponent(MapChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const rows = c.sortedRows();
    expect(rows.length).toBe(4);
    expect(rows[0].label).toBe('GUATEMALA');
    expect(rows[0].value).toBe(4520);
    expect(rows[1].label).toBe('QUETZALTENANGO');
    expect(rows[2].label).toBe('ALTA VERAPAZ');
    expect(rows[3].label).toBe('SACATEPEQUEZ');
  });
});
