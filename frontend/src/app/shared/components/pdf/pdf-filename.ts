/**
 * Convierte un título en un slug seguro para nombre de archivo: sin acentos,
 * en minúsculas y con guiones en lugar de espacios y símbolos. Lo usan los
 * botones de exportación para armar el filename de los PDFs.
 */
export function slugifyForFilename(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
