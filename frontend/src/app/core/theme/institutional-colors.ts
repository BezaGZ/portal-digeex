/**
 * Equivalente en TypeScript de la paleta de colores institucionales del Portal DIGEEX.
 * Se define en TypeScript para su uso en elementos que no pueden acceder a variables CSS
 * directamente (como gráficos en Canvas y generación de PDF).
 */
export const INSTITUTIONAL_COLORS = {
  /** Azul gobierno. Identidad principal del Estado. */
  govBlue: '#1E3159',
  /** Azul acento. Hovers, énfasis, subtítulos. */
  govBlueAccent: '#233E72',
  /** Verde seguridad. Acciones positivas, badges OK. */
  securityGreen: '#026961',
  /** Verde seguridad oscuro. Hover de acciones positivas. */
  securityGreenDark: '#235558',
  /** Naranja accent. Indicadores institucionales. */
  govAccent: '#F2A119',
  /** Naranja accent oscuro. Hover y combinaciones. */
  govAccentDark: '#A8723A',
  /** Competitividad. Categórico de programas. */
  competitividad: '#7B162F',
  /** Oportunidad. Categórico de programas. */
  oportunidad: '#FE8B5A',
  /** Modernidad. Categórico de programas. */
  modernidad: '#888EA5',
  /** Blanco surface. Fondos y texto sobre colores institucionales. */
  surface: '#FFFFFF',
} as const;

export type InstitutionalColorToken = keyof typeof INSTITUTIONAL_COLORS;

/**
 * Equivalente en TypeScript de los colores neutrales y escala de grises del tema CSS.
 * Se define en TypeScript para su uso en componentes que operan fuera de la interfaz del DOM
 * (como elementos dibujados en Canvas).
 */
export const THEME_NEUTRALS = {
  bodyOnLight: '#1f2937',
  bodyOnDark: '#f3f4f6',
  mutedOnLight: '#4b5563',
  mutedOnDark: '#9ca3af',
  gridOnLight: 'rgba(0,0,0,0.08)',
  gridOnDark: 'rgba(255,255,255,0.08)',
} as const;

export type ThemeNeutralToken = keyof typeof THEME_NEUTRALS;
