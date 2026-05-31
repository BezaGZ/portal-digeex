/**
 * Interfaces View - Modelos de presentación para componentes.
 * Estas interfaces representan datos procesados para la UI,
 * derivados de las entidades de DSpace pero simplificados.
 */

/**
 * Vista de colección/programa para componentes de listado.
 */
export interface CollectionView {
  id: string;
  name: string;
  description: string;
  type: 'collection' | 'community';
  /** Valor de dspace.entity.type de la colección en DSpace (ej: documento, galeria, estadistica) */
  format?: string;
  /** URL relativa del logo del programa, null cuando la collection no tiene portada. */
  logoUrl?: string | null;
}

/**
 * Vista de item/documento para componentes de listado.
 */
export interface ItemView {
  id: string;
  name: string;
  description: string;
  dateIssued: string;
  handle: string;
  coverImage: string | null;
  bitstreams: BitstreamView[];
  type: string;
  relationUri: string;
  /** UUID de la colección dueña del item; permite construir la URL canónica
   *  /programas/{owningCollectionUuid}/documentos/{itemUuid} desde búsqueda. */
  owningCollectionUuid?: string;
}

/**
 * Vista de bitstream procesado para descargas y visualización.
 *
 * `format` lleva el mime type (usado por previewers); `formatLabel` lleva
 * la etiqueta humana ("PDF", "Word", "Excel") que se muestra junto al
 * archivo en la vista publica. `formatLabel` es opcional para no romper
 * a los consumers existentes; los nuevos lo populan via inferBitstreamFormat.
 */
export interface BitstreamView {
  name: string;
  url: string;
  size: number;
  format: string;
  uuid: string;
  formatLabel?: string;
}

/**
 * Evento de paginación de PrimeNG Paginator (PaginatorState).
 */
export interface PaginatorEvent {
  first?: number;
  rows?: number;
  page?: number;
  pageCount?: number;
}

/**
 * Campo de metadata procesado para visualización.
 */
export interface MetadataFieldView {
  label: string;
  value: string | string[];
  type: 'text' | 'list' | 'date';
}