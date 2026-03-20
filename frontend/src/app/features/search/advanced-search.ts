import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CardModule } from 'primeng/card';

interface SearchFilters {
  query: string;
  comunidades: string[];
  colecciones: string[];
  tipoDocumento: string[];
  anioInicio: Date | null;
  anioFin: Date | null;
  orderBy: string;
}

interface SearchResult {
  id: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-advanced-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    MultiSelectModule,
    SelectModule,
    DatePickerModule,
    CardModule,
  ],
  templateUrl: './advanced-search.html',
})
export class AdvancedSearch {
  filters: SearchFilters = {
    query: '',
    comunidades: [],
    colecciones: [],
    tipoDocumento: [],
    anioInicio: null,
    anioFin: null,
    orderBy: 'relevancia',
  };

  isSearching = signal(false);
  hasSearched = signal(false);
  results = signal<SearchResult[]>([]);

  comunidadesOptions = [
    { label: 'PEAC', value: 'peac' },
    { label: 'PRONEA', value: 'pronea' },
    { label: 'Modalidades Flexibles', value: 'modalidades-flexibles' },
    { label: 'CEMUCAF', value: 'cemucaf' },
    { label: 'SCC', value: 'scc' },
    { label: 'ETCAE', value: 'etcae' },
    { label: 'EVA', value: 'eva' },
    { label: 'PROBEFI', value: 'probefi' },
  ];

  tipoDocumentoOptions = [
    { label: 'Manual/Guía', value: 'manual' },
    { label: 'Normativa', value: 'normativa' },
    { label: 'Investigación', value: 'investigacion' },
    { label: 'Informe', value: 'informe' },
    { label: 'Material Didáctico', value: 'material-didactico' },
    { label: 'Video', value: 'video' },
    { label: 'Presentación', value: 'presentacion' },
  ];

  orderByOptions = [
    { label: 'Relevancia', value: 'relevancia' },
    { label: 'Más reciente', value: 'fecha-desc' },
    { label: 'Más antiguo', value: 'fecha-asc' },
    { label: 'Título A-Z', value: 'titulo-asc' },
    { label: 'Título Z-A', value: 'titulo-desc' },
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  onSearch() {
    this.isSearching.set(true);
    this.hasSearched.set(true);
    this.cdr.markForCheck();

    setTimeout(() => {
      this.results.set([]);
      this.isSearching.set(false);
      this.cdr.markForCheck();
    }, 800);
  }

  clearFilters() {
    this.filters = {
      query: '',
      comunidades: [],
      colecciones: [],
      tipoDocumento: [],
      anioInicio: null,
      anioFin: null,
      orderBy: 'relevancia',
    };
    this.hasSearched.set(false);
    this.results.set([]);
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return (
      this.filters.comunidades.length > 0 ||
      this.filters.colecciones.length > 0 ||
      this.filters.tipoDocumento.length > 0 ||
      this.filters.anioInicio !== null ||
      this.filters.anioFin !== null
    );
  }
}
