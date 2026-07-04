import { Chart } from 'chart.js';

import './chart-setup';

/**
 * Tests de `chart-setup`.
 *
 * Módulo de side-effect que registra en Chart.js los controllers, escalas y
 * plugins que usan los charts de Stats (datalabels, treemap, choropleth).
 * Vive en el feature lazy para que chart.js no entre al bundle inicial; cada
 * chart component lo importa antes de renderizar.
 *
 * Ciclo 58 TDD — Sprint 10.
 */
describe('chart-setup', () => {
  /** Verifica que el controller treemap quede registrado. */
  it('should register the treemap controller', () => {
    expect(Chart.registry.controllers.get('treemap')).toBeDefined();
  });

  /** Verifica que el controller choropleth quede registrado. */
  it('should register the choropleth controller', () => {
    expect(Chart.registry.controllers.get('choropleth')).toBeDefined();
  });

  /**
   * Verifica que las escalas projection y color queden registradas.
   * Sin ellas el choropleth no puede proyectar el mapa ni pintar la escala.
   */
  it('should register the projection and color scales', () => {
    expect(Chart.registry.scales.get('projection')).toBeDefined();
    expect(Chart.registry.scales.get('color')).toBeDefined();
  });

  /** Verifica que el plugin datalabels quede registrado. */
  it('should register the datalabels plugin', () => {
    expect(Chart.registry.plugins.get('datalabels')).toBeDefined();
  });
});
