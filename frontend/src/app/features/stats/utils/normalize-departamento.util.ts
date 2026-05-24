/**
 * Alias entre nombres del Excel que no calzan con el TopoJSON oficial.
 * `EL PETEN`: el Excel de Docentes lleva artículo "EL", el TopoJSON usa
 * solo "Petén". (El Progreso sí lleva "EL" en ambos.)
 */
const ALIASES: Readonly<Record<string, string>> = {
  'EL PETEN': 'PETEN',
};

/**
 * Normaliza un nombre de departamento a forma canónica (mayúsculas, sin
 * diacríticos, sin sufijo ", GUATEMALA", trimeada) para matchear contra
 * el TopoJSON oficial sin tabla hardcoded por cada uno de los 22.
 */
export function normalizeDepartamento(name: string | null | undefined): string {
  if (name === null || name === undefined) return '';
  const normalized = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/,\s*GUATEMALA$/, '')
    .trim();
  return ALIASES[normalized] ?? normalized;
}
