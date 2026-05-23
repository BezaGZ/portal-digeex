/**
 * Utilidades para resolver headers de un Excel cuando el archivo fuente puede
 * variar en case (`Sexo`/`sexo`/`SEXO`) o traer whitespace (`Contrato  `,
 * `" QUETZALTENANGO"`). Los renderers declaran sus columnas en forma lógica
 * (minúsculas, sin espacios) y este módulo hace el matching contra los
 * headers reales del archivo subido por el admin.
 */

/** Trim + lowercase del header. Acepta null/undefined y los normaliza a string vacío. */
export function normalizeHeader(h: unknown): string {
  if (h === null || h === undefined) return '';
  return String(h).trim().toLowerCase();
}

/**
 * Mapea cada key lógica al header físico del Excel que matchea (case y
 * whitespace insensitive). Si falta alguna columna requerida, lanza un Error
 * con la lista completa de faltantes para que el renderer pueda fallar
 * temprano con un mensaje claro al admin.
 */
export function resolveHeaders(
  headers: readonly string[],
  requiredLogical: readonly string[],
): Record<string, string> {
  const physicalByNormalized: Record<string, string> = {};
  for (const h of headers) {
    physicalByNormalized[normalizeHeader(h)] = h;
  }

  const map: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of requiredLogical) {
    const physical = physicalByNormalized[key];
    if (physical === undefined) {
      missing.push(key);
    } else {
      map[key] = physical;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Faltan columnas requeridas en el Excel: ${missing.join(', ')}`);
  }
  return map;
}

/**
 * Lee una celda de la fila por header físico y trimea si el valor es string;
 * preserva el case original del valor (los renderers agrupan por valor
 * exacto, pero los datos del Excel suelen venir con espacios sobrantes).
 */
export function readCell(row: Record<string, unknown>, originalHeader: string): unknown {
  const value = row[originalHeader];
  return typeof value === 'string' ? value.trim() : value;
}
