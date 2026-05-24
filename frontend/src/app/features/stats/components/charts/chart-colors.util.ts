/**
 * Tokens de color para los chart components de Stats.
 *
 *
 * Las palettes (`piePalette`, `treemapPalette`) se derivan de los tokens
 * leídos en sus primeras posiciones, y completan con tintes adicionales
 * que no tienen var directa en `styles.css` (vienen del `DigeexPreset` de
 * PrimeNG y se mantienen como constantes acá).
 */

export interface ChartColors {
  readonly primary: string;
  readonly primaryHover: string;
  readonly secondary: string;
  readonly secondaryHover: string;
  readonly surface: string;
  readonly axisGrid: string;
  readonly piePalette: readonly string[];
  readonly treemapPalette: readonly string[];
}

const FALLBACK_PRIMARY = '#1E3159';
const FALLBACK_PRIMARY_HOVER = '#233E72';
const FALLBACK_SECONDARY = '#026961';
const FALLBACK_SECONDARY_HOVER = '#235558';
const FALLBACK_ACCENT = '#F2A119';
const FALLBACK_ACCENT_DARK = '#A8723A';
const FALLBACK_COMPETITIVIDAD = '#9F0B30';
const FALLBACK_OPORTUNIDAD = '#FE8B5A';
const FALLBACK_MODERNIDAD = '#888EA5';
const FALLBACK_SURFACE = '#FFFFFF';

/**
 * Tintes claros del azul institucional que no existen como CSS var en
 * `styles.css`; vienen del `DigeexPreset` de PrimeNG (`primary.200` a
 * `primary.400`). Se mantienen como constantes acá para completar el
 * gradiente del treemap.
 */
const TREEMAP_LIGHT_TINTS: readonly string[] = ['#5879B6', '#7691C3', '#9DB1D4', '#C4D0E5'];

/** Color de la línea de grilla horizontal de los charts. Cosmético, sin var. */
const AXIS_GRID = 'rgba(0,0,0,0.05)';

export function readChartColors(): ChartColors {
  if (typeof document === 'undefined') {
    return buildColors(
      FALLBACK_PRIMARY,
      FALLBACK_PRIMARY_HOVER,
      FALLBACK_SECONDARY,
      FALLBACK_SECONDARY_HOVER,
      FALLBACK_ACCENT,
      FALLBACK_ACCENT_DARK,
      FALLBACK_COMPETITIVIDAD,
      FALLBACK_OPORTUNIDAD,
      FALLBACK_MODERNIDAD,
      FALLBACK_SURFACE,
    );
  }
  const root = document.documentElement;
  const read = (name: string, fallback: string): string => {
    const val = getComputedStyle(root).getPropertyValue(name).trim();
    return val !== '' ? val : fallback;
  };
  return buildColors(
    read('--gob-azul-gobierno', FALLBACK_PRIMARY),
    read('--gob-azul-acento', FALLBACK_PRIMARY_HOVER),
    read('--gob-seguridad', FALLBACK_SECONDARY),
    read('--gob-seguridad-dark', FALLBACK_SECONDARY_HOVER),
    read('--color-gob-accent', FALLBACK_ACCENT),
    read('--color-gob-accent-dark', FALLBACK_ACCENT_DARK),
    read('--color-competitividad', FALLBACK_COMPETITIVIDAD),
    read('--color-oportunidad', FALLBACK_OPORTUNIDAD),
    read('--color-modernidad', FALLBACK_MODERNIDAD),
    read('--color-surface', FALLBACK_SURFACE),
  );
}

/**
 * Ensambla el shape `ChartColors` a partir de los hex resueltos. Centraliza
 * la composición de las dos palettes para que ambos paths (DOM presente y
 * fallback puro) produzcan el mismo objeto.
 */
function buildColors(
  primary: string,
  primaryHover: string,
  secondary: string,
  secondaryHover: string,
  accent: string,
  accentDark: string,
  competitividad: string,
  oportunidad: string,
  modernidad: string,
  surface: string,
): ChartColors {
  return {
    primary,
    primaryHover,
    secondary,
    secondaryHover,
    surface,
    axisGrid: AXIS_GRID,
    /**
     * 8 categóricos para slices del pie. Orden: institucionales (primary,
     * accent, secondary), de programa (competitividad, oportunidad,
     * modernidad), y derivados (primaryHover, accentDark) para que
     * categorías nuevas no caigan en el mismo tono que las primeras.
     */
    piePalette: [
      primary,
      accent,
      secondary,
      competitividad,
      oportunidad,
      modernidad,
      primaryHover,
      accentDark,
    ],
    /**
     * 6 tones azul gobierno → celeste para el gradiente del treemap. Los
     * primeros dos heredan de `--gob-azul-gobierno` y `--gob-azul-acento`;
     * los cuatro restantes son tintes derivados que no tienen var directa.
     */
    treemapPalette: [primary, primaryHover, ...TREEMAP_LIGHT_TINTS],
  };
}
