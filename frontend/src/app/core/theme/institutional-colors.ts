/**
 * Tokens de color institucionales del Portal DIGEEX. Fuente única de los
 * hex que el portal usa para identidad visual. Cualquier consumidor TS
 * (charts, builder del PDF, futuros reportes) importa de acá; los espejos
 * existen en `styles.css` (CSS variables `:root`) y en los templates como
 * Tailwind arbitrary values y deben mantenerse sincronizados con este
 * archivo cuando DIGEEX cambie la paleta.
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
  competitividad: '#9F0B30',
  /** Oportunidad. Categórico de programas. */
  oportunidad: '#FE8B5A',
  /** Modernidad. Categórico de programas. */
  modernidad: '#888EA5',
  /** Blanco surface. Fondos y texto sobre colores institucionales. */
  surface: '#FFFFFF',
} as const;

export type InstitutionalColorToken = keyof typeof INSTITUTIONAL_COLORS;
