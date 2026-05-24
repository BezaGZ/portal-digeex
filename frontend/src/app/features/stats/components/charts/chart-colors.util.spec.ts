import { readChartColors } from './chart-colors.util';

/**
 * Tests del helper `readChartColors`.
 *
 * Lee del `documentElement` las CSS variables del design system del proyecto
 * y las devuelve como literals hex listos para consumir por Chart.js, que no
 * resuelve `var(...)` sobre el canvas. En jsdom de Vitest las CSS vars no se
 * cargan desde `styles.css`, así que cada token cae a un fallback hex
 * idéntico al de `styles.css`; los tests anclan ese contrato.
 *
 * Ciclo 14 TDD — Sprint 7.
 */

describe('readChartColors', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
  });

  /**
   * El shape devuelto trae todas las claves que consumen los cinco chart
   * components (primary, primaryHover, secondary, secondaryHover, surface,
   * axisGrid) más las dos palettes derivadas (piePalette categórica de 8
   * entradas y treemapPalette gradiente azul de 6 entradas).
   */
  it('should return the full color object shape used by chart components', () => {
    const c = readChartColors();

    expect(c.primary).toBeDefined();
    expect(c.primaryHover).toBeDefined();
    expect(c.secondary).toBeDefined();
    expect(c.secondaryHover).toBeDefined();
    expect(c.surface).toBeDefined();
    expect(c.axisGrid).toBeDefined();
    expect(c.piePalette.length).toBe(8);
    expect(c.treemapPalette.length).toBe(6);
  });

  /**
   * Si las CSS vars no están en :root (caso default de jsdom sin
   * styles.css), el helper cae a hex que matcheen visualmente con
   * styles.css del proyecto. Asegura que tests, SSR y render previo al
   * load de CSS no produzcan canvases transparentes.
   */
  it('should fall back to hex matching styles.css when CSS vars are absent', () => {
    document.documentElement.removeAttribute('style');
    const c = readChartColors();

    expect(c.primary).toBe('#1E3159');
    expect(c.primaryHover).toBe('#233E72');
    expect(c.secondary).toBe('#026961');
    expect(c.secondaryHover).toBe('#235558');
    expect(c.surface).toBe('#FFFFFF');
    expect(c.treemapPalette[0]).toBe('#1E3159');
    expect(c.piePalette[0]).toBe('#1E3159');
  });

  /**
   * Cuando la var sí está seteada en :root, el helper la devuelve tal
   * cual. Esto cubre el flujo real del browser con styles.css cargado: si
   * DIGEEX cambia `--gob-azul-gobierno` en el design system, los charts
   * heredan el nuevo color sin que nadie toque los componentes.
   */
  it('should read the value from documentElement when the CSS var is defined', () => {
    document.documentElement.style.setProperty('--gob-azul-gobierno', '#ABCDEF');
    document.documentElement.style.setProperty('--gob-seguridad', '#112233');

    const c = readChartColors();

    expect(c.primary).toBe('#ABCDEF');
    expect(c.secondary).toBe('#112233');
    expect(c.treemapPalette[0]).toBe('#ABCDEF');
    expect(c.piePalette[0]).toBe('#ABCDEF');
  });
});
