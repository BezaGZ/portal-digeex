import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CardModule } from 'primeng/card';
import { SearchFilters, SelectOption, ScopeOption } from '../../models/search-filters.model';
import { Facet } from '../../../../core/api/models/discovery.model';
import { VocabularyDisplayService } from '../../../../core/api/vocabulary-display.service';

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
  private readonly vocabDisplay = inject(VocabularyDisplayService);

  scopeOptions = input<ScopeOption[]>([]);

  search = output<SearchFilters>();
  clear = output<void>();
  scopeChange = output<string>();

  /** Opciones dinámicas pobladas desde facetas de Solr */
  tipoDocumentoOptions = signal<SelectOption[]>([]);
  nivelEducativoOptions = signal<SelectOption[]>([]);
  idiomaOptions = signal<SelectOption[]>([]);

  /** Mapa: nombre de faceta en DSpace → signal que actualiza */
  private readonly facetSignalMap: Record<string, ReturnType<typeof signal<SelectOption[]>>> = {
    itemtype: this.tipoDocumentoOptions,
    audience: this.nivelEducativoOptions,
    language: this.idiomaOptions,
  };

  /** Maps cacheados de stored value → display label por vocabulario. */
  private readonly tipoDocumentoMap = toSignal(this.vocabDisplay.displayMap$('tipos-documento'), {
    initialValue: new Map<string, string>(),
  });
  private readonly nivelEducativoMap = toSignal(
    this.vocabDisplay.displayMap$('niveles-educativos'),
    { initialValue: new Map<string, string>() },
  );
  private readonly idiomaMap = toSignal(this.vocabDisplay.displayMap$('idiomas-digeex'), {
    initialValue: new Map<string, string>(),
  });

  private readonly facetVocabMap: Record<string, () => Map<string, string>> = {
    itemtype: () => this.tipoDocumentoMap(),
    audience: () => this.nivelEducativoMap(),
    language: () => this.idiomaMap(),
  };

  /** Indica si las facetas fueron cargadas (habilita los filtros) */
  facetsLoaded = signal(false);

  orderByOptions: SelectOption[] = [
    { label: 'Relevancia', value: 'relevancia' },
    { label: 'Más reciente', value: 'fecha-desc' },
    { label: 'Más antiguo', value: 'fecha-asc' },
    { label: 'Título A-Z', value: 'titulo-asc' },
    { label: 'Título Z-A', value: 'titulo-desc' },
  ];

  filters: SearchFilters = {
    query: '',
    scope: '',
    tipoDocumento: [],
    nivelEducativo: [],
    idioma: [],
    autorArea: '',
    anioInicio: null,
    anioFin: null,
    orderBy: 'relevancia',
  };

  onScopeSelected() {
    if (this.filters.scope) {
      this.resetFilterValues();
      this.scopeChange.emit(this.filters.scope);
    } else {
      this.facetsLoaded.set(false);
      this.tipoDocumentoOptions.set([]);
      this.nivelEducativoOptions.set([]);
      this.idiomaOptions.set([]);
    }
  }

  /**
   * Llamado por el componente padre después de cargar las facetas del scope seleccionado.
   * Usa el facetSignalMap para asignar cada faceta de DSpace a su dropdown correspondiente.
   */
  updateFacetOptions(facets: Facet[]) {
    for (const facet of facets) {
      const targetSignal = this.facetSignalMap[facet.name];
      if (!targetSignal) continue;
      const lookup = this.facetVocabMap[facet.name]?.() ?? new Map<string, string>();
      targetSignal.set(
        facet.values.map((v) => ({
          label: `${lookup.get(v.label) ?? v.label} (${v.count})`,
          value: v.label,
        })),
      );
    }
    this.facetsLoaded.set(true);
  }

  onSearch() {
    this.search.emit({ ...this.filters });
  }

  onClear() {
    const currentScope = this.filters.scope;
    this.filters = {
      query: '',
      scope: currentScope,
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
      (this.filters.tipoDocumento?.length ?? 0) > 0 ||
      (this.filters.nivelEducativo?.length ?? 0) > 0 ||
      (this.filters.idioma?.length ?? 0) > 0 ||
      (this.filters.autorArea ?? '') !== '' ||
      this.filters.anioInicio !== null ||
      this.filters.anioFin !== null
    );
  }

  get canSearch(): boolean {
    return !!this.filters.scope && this.facetsLoaded();
  }

  private resetFilterValues() {
    this.filters.tipoDocumento = [];
    this.filters.nivelEducativo = [];
    this.filters.idioma = [];
    this.filters.autorArea = '';
    this.filters.anioInicio = null;
    this.filters.anioFin = null;
  }
}
