export interface SearchFilters {
  query: string;
  comunidades: string[];
  tipoDocumento: string[];
  nivelEducativo: string[];
  idioma: string[];
  autorArea: string;
  anioInicio: Date | null;
  anioFin: Date | null;
  orderBy: string;
}
