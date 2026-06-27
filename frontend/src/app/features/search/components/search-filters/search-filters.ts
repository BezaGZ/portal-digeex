import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { take, catchError } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';
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
    SkeletonModule,
  ],
  templateUrl: './search-filters.html',
})
export class SearchFiltersComponent {
  private readonly vocabDisplay = inject(VocabularyDisplayService);

  scopeOptions = input<ScopeOption[]>([]);

  /** True mientras el padre carga las opciones del dropdown (comunidad + subcomunidades + colecciones). */
  scopeLoading = input<boolean>(false);

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

  /**
   * Faceta de DSpace → vocabulario que la traduce. Solo `language` lo necesita:
   * guarda el código ISO (`es`) y hay que mostrar el display (`Español`).
   * `itemtype` y `audience` ya llegan legibles desde la faceta, así que no
   * piden vocabulario.
   */
  private readonly vocabByFacet: Record<string, string> = {
    language: 'idiomas-digeex',
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
    const handled = facets.filter((f) => this.facetSignalMap[f.name]);

    // Facetas ya legibles (itemtype, audience): se arman directo, sin vocabulario.
    for (const facet of handled) {
      if (!this.vocabByFacet[facet.name]) {
        this.facetSignalMap[facet.name].set(this.toOptions(facet));
      }
    }

    // Facetas con código (idioma): traducción on-demand con el vocabulario
    // cacheado, esperando el map antes de armar la etiqueta para no mostrar el
    // código crudo.
    const translated = handled.filter((f) => this.vocabByFacet[f.name]);
    if (translated.length === 0) {
      this.facetsLoaded.set(true);
      return;
    }

    const maps$ = Object.fromEntries(
      translated.map((f) => [f.name, this.vocabDisplay.displayMap$(this.vocabByFacet[f.name]).pipe(take(1))]),
    );

    forkJoin(maps$)
      .pipe(
        // Si falla la carga del vocabulario, igual se habilitan los filtros con
        // la etiqueta cruda en vez de dejar la búsqueda bloqueada.
        catchError(() => of({} as Record<string, Map<string, string>>)),
      )
      .subscribe((maps) => {
        for (const facet of translated) {
          this.facetSignalMap[facet.name].set(this.toOptions(facet, maps[facet.name]));
        }
        this.facetsLoaded.set(true);
      });
  }

  /** Mapea los valores de una faceta a opciones; traduce el label si hay vocabulario. */
  private toOptions(facet: Facet, lookup?: Map<string, string>): SelectOption[] {
    return facet.values.map((v) => ({
      label: `${lookup?.get(v.label) ?? v.label} (${v.count})`,
      value: v.label,
    }));
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
