/**
 * Item del listado público de Estadística. Resumen ligero del item de DSpace
 * sin descargar el bitstream del Excel: la card del listado solo necesita
 * metadata textual. El Excel se descarga lazy al entrar al detalle (CA-07).
 */
export interface StatsItem {
  readonly uuid: string;
  readonly title: string;
  readonly abstract: string;
  readonly dataset: string;
  readonly issued: string;
}

/** Página de la búsqueda con info de paginación para el paginator del listado. */
export interface StatsItemPage {
  readonly items: readonly StatsItem[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly page: number;
  readonly size: number;
}
