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
}

/**
 * Vista de bitstream procesado para descargas y visualización.
 */
export interface BitstreamView {
  name: string;
  url: string;
  size: number;
  format: string;
  uuid: string;
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