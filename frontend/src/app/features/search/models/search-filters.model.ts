export interface SearchFilters {
  query: string;
  scope: string;
  tipoDocumento: string[];
  nivelEducativo: string[];
  idioma: string[];
  autorArea: string;
  anioInicio: Date | null;
  anioFin: Date | null;
  orderBy: string;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface ScopeOption {
  label: string;
  value: string;
  group?: string;
}
