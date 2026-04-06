import { Component, ChangeDetectionStrategy, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CardModule } from 'primeng/card';
import { SearchFilters } from '../../models/search-filters.model';

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-search-filters',
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
  templateUrl: './search-filters.html',
})
export class SearchFiltersComponent {
  comunidadesOptions = input<SelectOption[]>([]);

  search = output<SearchFilters>();
  clear = output<void>();

  tipoDocumentoOptions: SelectOption[] = [
    { label: 'Guía', value: 'Guía' },
    { label: 'Informe', value: 'Informe' },
    { label: 'Manual', value: 'Manual' },
    { label: 'Normativa', value: 'Normativa' },
    { label: 'Currículo', value: 'Currículo' },
    { label: 'Evaluación', value: 'Evaluación' },
    { label: 'Material educativo', value: 'Material educativo' },
    { label: 'Libro de texto', value: 'Libro de texto' },
    { label: 'Acuerdo', value: 'Acuerdo' },
    { label: 'Resolución', value: 'Resolución' },
    { label: 'Memoria de labores', value: 'Memoria de labores' },
    { label: 'Investigaciones', value: 'Investigaciones' },
    { label: 'Calendario anual', value: 'Calendario anual' },
    { label: 'Protocolos', value: 'Protocolos' },
  ];

  nivelEducativoOptions: SelectOption[] = [
    { label: 'Primaria', value: 'Primaria' },
    { label: 'Básico', value: 'Básico' },
    { label: 'Diversificado', value: 'Diversificado' },
    { label: 'Formación técnico laboral', value: 'Formación técnico laboral' },
    { label: 'Todos', value: 'Todos' },
  ];

  idiomaOptions: SelectOption[] = [
    { label: 'Español', value: 'es' },
    { label: 'Achi', value: 'acr' },
    { label: 'Akateko', value: 'knj' },
    { label: 'Awakateko', value: 'agu' },
    { label: 'Chalchiteko', value: 'caa' },
    { label: "Ch'orti'", value: 'caa' },
    { label: 'Chuj', value: 'cac' },
    { label: "Itza'", value: 'itz' },
    { label: 'Ixil', value: 'ixl' },
    { label: "Jakalteko (Popti')", value: 'jac' },
    { label: 'Kaqchikel', value: 'cak' },
    { label: "K'iche'", value: 'quc' },
    { label: 'Mam', value: 'mam' },
    { label: 'Mopan', value: 'mop' },
    { label: 'Poqomam', value: 'poa' },
    { label: "Poqomchi'", value: 'poh' },
    { label: "Q'anjob'al", value: 'kjb' },
    { label: "Q'eqchi'", value: 'kek' },
    { label: 'Sakapulteko', value: 'quv' },
    { label: 'Sipakapense', value: 'qum' },
    { label: 'Tektiteko', value: 'ttc' },
    { label: "Tz'utujil", value: 'tzj' },
    { label: 'Uspanteko', value: 'usp' },
    { label: 'Garífuna', value: 'cab' },
    { label: 'Xinka', value: 'xin' },
    { label: 'Inglés', value: 'en' },
    { label: 'Francés', value: 'fr' },
    { label: 'Portugués', value: 'pt' },
    { label: 'Alemán', value: 'de' },
    { label: 'Chino mandarín', value: 'zh' },
    { label: 'Japonés', value: 'ja' },
    { label: 'Coreano', value: 'ko' },
    { label: 'Italiano', value: 'it' },
    { label: 'Árabe', value: 'ar' },
    { label: 'Otro', value: 'other' },
  ];

  orderByOptions: SelectOption[] = [
    { label: 'Relevancia', value: 'relevancia' },
    { label: 'Más reciente', value: 'fecha-desc' },
    { label: 'Más antiguo', value: 'fecha-asc' },
    { label: 'Título A-Z', value: 'titulo-asc' },
    { label: 'Título Z-A', value: 'titulo-desc' },
  ];

  constructor() {
    effect(() => {
      const options = this.comunidadesOptions();
      if (options.length > 0 && (!this.filters.comunidades || this.filters.comunidades.length === 0)) {
        this.filters.comunidades = options.map((o) => o.value);
      }
    });
  }

  filters: SearchFilters = {
    query: '',
    comunidades: [],
    tipoDocumento: [],
    nivelEducativo: [],
    idioma: [],
    autorArea: '',
    anioInicio: null,
    anioFin: null,
    orderBy: 'relevancia',
  };

  onSearch() {
    this.search.emit({ ...this.filters });
  }

  onClear() {
    this.filters = {
      query: '',
      comunidades: [],
      tipoDocumento: [],
      nivelEducativo: [],
      idioma: [],
      autorArea: '',
      anioInicio: null,
      anioFin: null,
      orderBy: 'relevancia',
    };
    this.clear.emit();
  }

  hasActiveFilters(): boolean {
    return (
      (this.filters.comunidades?.length ?? 0) > 0 ||
      (this.filters.tipoDocumento?.length ?? 0) > 0 ||
      (this.filters.nivelEducativo?.length ?? 0) > 0 ||
      (this.filters.idioma?.length ?? 0) > 0 ||
      (this.filters.autorArea ?? '') !== '' ||
      this.filters.anioInicio !== null ||
      this.filters.anioFin !== null
    );
  }

}
