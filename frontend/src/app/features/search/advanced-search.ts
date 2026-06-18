import { Component, ChangeDetectionStrategy, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PaginatorModule } from 'primeng/paginator';
import { forkJoin, of, EMPTY } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { DiscoveryService } from '../../core/api/discovery.service';
import { SearchResult, FacetFilter } from '../../core/api/models/discovery.model';
import { Item } from '../../core/api/models/item.model';
import { Collection } from '../../core/api/models/collection.model';
import { Bitstream } from '../../core/api/models/bitstream.model';
import { ItemView, BitstreamView, PaginatorEvent } from '../../core/api/models/view.model';
import { inferBitstreamFormat } from '../../core/api/bitstream-format.util';
import { DSpaceApiService } from '../../core/api/dspace-api.service';
import { CommunityApiService } from '../../core/api/community-api.service';
import { CollectionApiService } from '../../core/api/collection-api.service';
import { BitstreamDownloadService } from '../../core/api/bitstream-download.service';
import { DocumentCardComponent, SkeletonCardComponent, EmptyStateComponent } from '../../shared';
import { SearchFiltersComponent } from './components/search-filters/search-filters';
import { SearchFilters, ScopeOption } from './models/search-filters.model';
import { ENTITY_TYPE } from '../../core/config/digeex-values.config';
import { SearchStateService } from './services/search-state.service';

@Component({
  selector: 'app-advanced-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    PaginatorModule,
    DocumentCardComponent,
    SkeletonCardComponent,
    EmptyStateComponent,
    SearchFiltersComponent,
  ],
  templateUrl: './advanced-search.html',
})
export class AdvancedSearch implements OnInit {
  @ViewChild(SearchFiltersComponent) filtersComponent!: SearchFiltersComponent;

  /* inject() en lugar de constructor para que el orden de inicialización de
     campos pueda referenciar el servicio (TS evalúa property initializers
     antes del cuerpo del constructor). */
  private readonly discoveryService = inject(DiscoveryService);
  private readonly dspaceApi = inject(DSpaceApiService);
  private readonly communityApi = inject(CommunityApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly router = inject(Router);
  private readonly searchState = inject(SearchStateService);
  private readonly downloader = inject(BitstreamDownloadService);

  /** Signals expuestos al template; persistidos en SearchStateService para
   *  que sobrevivan a la destrucción del componente al ir al detalle. */
  readonly isSearching = this.searchState.isSearching;
  readonly hasSearched = this.searchState.hasSearched;
  readonly results = this.searchState.results;
  readonly totalElements = this.searchState.totalElements;
  readonly scopeOptions = this.searchState.scopeOptions;
  readonly currentPage = this.searchState.currentPage;

  /** Estado local que no necesita persistir al volver del detalle. */
  isLoadingFacets = signal(false);

  itemsPerPage = 10;

  /** UUID de la community raíz DIGEEX — se detecta dinámicamente */
  private digeexCommunityUuid = '';

  ngOnInit() {
    // Restaura la búsqueda anterior cuando el usuario regresa del detalle.
    if (this.searchState.scope()) {
      if (this.searchState.scopeOptions().length === 0) {
        this.loadScopeOptions();
      }
      this.loadFacetsForScope(this.searchState.scope());
      this.executeSearch();
    } else if (this.searchState.scopeOptions().length === 0) {
      // Las opciones sobreviven en SearchStateService entre visitas: reentrar
      // sin scope elegido no debe repetir las peticiones del dropdown.
      this.loadScopeOptions();
    }
  }

  onScopeChange(scopeUuid: string) {
    this.searchState.scope.set(scopeUuid);
    const selectedOption = this.searchState.scopeOptions().find((o) => o.value === scopeUuid);
    this.searchState.scopeType.set(selectedOption?.scopeType ?? 'community');
    this.searchState.filters.set(null);
    this.searchState.hasSearched.set(false);
    this.searchState.results.set([]);
    this.searchState.totalElements.set(0);
    this.loadFacetsForScope(scopeUuid);
  }

  onSearch(filters: SearchFilters) {
    this.searchState.filters.set(filters);
    this.searchState.currentPage.set(0);
    this.executeSearch();
  }

  onClear() {
    this.searchState.filters.set(null);
    this.searchState.currentPage.set(0);
    this.searchState.results.set([]);
    this.searchState.totalElements.set(0);
    this.searchState.hasSearched.set(false);
  }

  onPageChange(event: PaginatorEvent) {
    this.searchState.currentPage.set(event.page ?? 0);
    this.executeSearch();
  }

  navigateToDocument(item: ItemView) {
    /* Ruta canónica con la colección dueña como contexto. Si por alguna razón
       el item llegó sin owningCollectionUuid (search response incompleto, item
       huérfano), caer al deep link corto evita romper la navegación. */
    if (item.owningCollectionUuid) {
      this.router.navigate(['/programas', item.owningCollectionUuid, 'documentos', item.id]);
    } else {
      this.router.navigate(['/documentos', item.id]);
    }
  }

  /** Set de itemIds que están en proceso de descarga lazy; los cards lo bindean a [downloading]. */
  readonly downloadingItems = signal(new Set<string>());

  isDownloading(itemId: string): boolean {
    return this.downloadingItems().has(itemId);
  }

  /**
   * Descarga del card en resultados de búsqueda. Hace lazy lookup del bundle
   * ORIGINAL del item clickeado y delega al BitstreamDownloadService que
   * decide single vs ZIP. Mismo patrón que program-view.onDownloadItem.
   */
  downloadItem(item: ItemView): void {
    if (this.isDownloading(item.id)) return;
    const next = new Set(this.downloadingItems());
    next.add(item.id);
    this.downloadingItems.set(next);

    this.dspaceApi
      .getBundles(item.id)
      .pipe(
        switchMap((bundlesResponse) => {
          const bundles = bundlesResponse._embedded?.['bundles'] || [];
          const original = bundles.find((b) => b.name === 'ORIGINAL');
          if (!original) return of([] as BitstreamView[]);
          return this.dspaceApi.getBitstreamsFromBundle(original.uuid).pipe(
            map((res) => {
              const list = res?._embedded?.['bitstreams'] || [];
              return list.map((b: Bitstream) => {
                const fmt = inferBitstreamFormat(b.name || '');
                return {
                  name: b.name || '',
                  url: `/server/api/core/bitstreams/${b.uuid}/content`,
                  size: b.sizeBytes || 0,
                  format: fmt.mime,
                  formatLabel: fmt.label,
                  uuid: b.uuid,
                } as BitstreamView;
              });
            }),
          );
        }),
      )
      .subscribe({
        next: async (bitstreams) => {
          await this.downloader.downloadAuto(bitstreams, item.name || 'documento');
          this.clearDownloading(item.id);
        },
        error: () => this.clearDownloading(item.id),
      });
  }

  private clearDownloading(itemId: string): void {
    const next = new Set(this.downloadingItems());
    next.delete(itemId);
    this.downloadingItems.set(next);
  }

  /**
   * Carga opciones de ámbito: sub-comunidades como grupos, colecciones como
   * programas individuales, más la opción "Todos los programas" con el UUID
   * de la comunidad raíz DIGEEX. Las colecciones se piden en paralelo con
   * `forkJoin` y el orden del dropdown sigue al de las subdirecciones.
   */
  private loadScopeOptions() {
    this.communityApi
      .list(0, 10)
      .pipe(
        map((response) => {
          const communities = response._embedded?.['communities'] || [];
          return (
            communities.find(
              (c) =>
                c.name?.includes('DIGEEX') ||
                c.metadata?.['dc.title']?.[0]?.value?.includes('DIGEEX') ||
                c.metadata?.['dc.title']?.[0]?.value?.includes('Extraescolar'),
            ) ?? null
          );
        }),
        switchMap((digeex) => {
          if (!digeex) return EMPTY;
          this.digeexCommunityUuid = digeex.uuid;
          const base: ScopeOption = {
            label: 'Todos los programas (DIGEEX)',
            value: digeex.uuid,
            scopeType: 'community',
          };
          // Variantes listAll (expand+reduce hasta la última página): el
          // dropdown debe mostrar todas las subdirecciones y programas, no
          // la primera página de cada uno.
          return this.communityApi.listAllSubcommunities(digeex.uuid).pipe(
            switchMap((subCommunities) => {
              if (subCommunities.length === 0) return of([base]);
              const perSub$ = subCommunities.map((sub) =>
                this.collectionApi.listAllByCommunity(sub.uuid).pipe(
                  // Una subdirección caída no debe colgar el dropdown completo:
                  // sus programas se omiten y el resto se publica igual.
                  catchError(() => of([] as Collection[])),
                  map((collections) => this.buildSubdireccionOptions(sub, collections)),
                ),
              );
              return forkJoin(perSub$).pipe(map((groups) => [base, ...groups.flat()]));
            }),
          );
        }),
        // Fallo de los niveles superiores: no hay nada que publicar, pero el
        // error no debe escaparse sin manejador.
        catchError(() => EMPTY),
      )
      .subscribe((options) => this.searchState.scopeOptions.set(options));
  }

  /** Arma el grupo del dropdown de una subdirección: su "(todos)" + sus programas Documento. */
  private buildSubdireccionOptions(
    sub: { uuid: string; name?: string; metadata?: Record<string, { value?: string }[]> },
    collections: { uuid: string; name?: string; metadata?: Record<string, { value?: string }[]> }[],
  ): ScopeOption[] {
    const subName = sub.metadata?.['dc.title']?.[0]?.value || sub.name || '';
    const options: ScopeOption[] = [
      { label: `${subName} (todos)`, value: sub.uuid, group: subName, scopeType: 'community' },
    ];
    for (const col of collections) {
      if (col.metadata?.['dspace.entity.type']?.[0]?.value === ENTITY_TYPE.DOCUMENTO) {
        options.push({
          label: col.metadata?.['dc.title']?.[0]?.value || col.name || '',
          value: col.uuid,
          group: subName,
          scopeType: 'collection',
        });
      }
    }
    return options;
  }

  /**
   * Carga facetas para el ámbito seleccionado usando size=0 (no se devuelven elementos).
   */
  private loadFacetsForScope(scopeUuid: string) {
    this.isLoadingFacets.set(true);

    const facetFilters: FacetFilter[] = [];
    if (this.searchState.scopeType() === 'community') {
      facetFilters.push({ name: 'entityType', value: ENTITY_TYPE.DOCUMENTO, operator: 'equals' });
    }

    this.discoveryService.search({
      scope: scopeUuid,
      size: 0,
      filters: facetFilters.length > 0 ? facetFilters : undefined,
    }).pipe(
      catchError(() => {
        this.isLoadingFacets.set(false);
        return EMPTY;
      }),
    ).subscribe((result) => {
      this.isLoadingFacets.set(false);
      if (this.filtersComponent) {
        this.filtersComponent.updateFacetOptions(result.facets);
      }
    });
  }

  /**
   * Ejecuta búsqueda con un único ámbito + paginación del lado del servidor.
   */
  private executeSearch() {
    const filters = this.searchState.filters();
    const scope = filters?.scope || this.searchState.scope();

    if (!scope) return;

    this.searchState.isSearching.set(true);
    this.searchState.hasSearched.set(true);

    const facetFilters = this.buildFacetFilters(filters);

    this.discoveryService.search({
      scope,
      query: filters?.query || undefined,
      sort: filters ? this.mapSort(filters.orderBy) : undefined,
      filters: facetFilters.length > 0 ? facetFilters : undefined,
      page: this.searchState.currentPage(),
      size: this.itemsPerPage,
      // owningCollection embebido: arma la URL canónica del detalle sin una
      // petición por item (antes era 1+N).
      embeds: ['thumbnail', 'owningCollection'],
    }).pipe(
      catchError((error) => {
        console.error('Error en búsqueda:', error);
        this.searchState.results.set([]);
        this.searchState.totalElements.set(0);
        this.searchState.isSearching.set(false);
        return EMPTY;
      }),
    ).subscribe((result: SearchResult) => {
      this.searchState.totalElements.set(result.totalElements);
      this.loadItemDetails(result.items);
    });
  }

  private buildFacetFilters(filters: SearchFilters | null): FacetFilter[] {
    const facets: FacetFilter[] = [];

    /**
     * Si el scope es community o sub-community, filtrar solo items de tipo "documento"
     * para no mezclar álbumes de galería ni estadísticas en los resultados.
     */
    if (this.searchState.scopeType() === 'community') {
      facets.push({ name: 'entityType', value: ENTITY_TYPE.DOCUMENTO, operator: 'equals' });
    }

    if (!filters) return facets;

    if (filters.tipoDocumento?.length > 0) {
      for (const tipo of filters.tipoDocumento) {
        facets.push({ name: 'itemtype', value: tipo, operator: 'equals' });
      }
    }

    if (filters.nivelEducativo?.length > 0) {
      for (const nivel of filters.nivelEducativo) {
        facets.push({ name: 'audience', value: nivel, operator: 'equals' });
      }
    }

    if (filters.idioma?.length > 0) {
      for (const idioma of filters.idioma) {
        facets.push({ name: 'language', value: idioma, operator: 'equals' });
      }
    }

    if (filters.autorArea) {
      facets.push({ name: 'author', value: filters.autorArea, operator: 'contains' });
    }

    if (filters.anioInicio || filters.anioFin) {
      const start = filters.anioInicio ? filters.anioInicio.getFullYear() : '*';
      const end = filters.anioFin ? filters.anioFin.getFullYear() : '*';
      facets.push({ name: 'dateIssued', value: `[${start} TO ${end}]`, operator: 'equals' });
    }

    return facets;
  }

  private mapSort(orderBy: string): string | undefined {
    const sortMap: Record<string, string> = {
      'fecha-desc': 'dc.date.issued,DESC',
      'fecha-asc': 'dc.date.issued,ASC',
      'titulo-asc': 'dc.title,ASC',
      'titulo-desc': 'dc.title,DESC',
    };
    return sortMap[orderBy];
  }

  /**
   * Mapea los resultados a la vista de cards. Es sincrónico: el listado no
   * pre-carga bundles ni bitstreams (esos se consultan solo al "Descargar"), y
   * tanto el thumbnail como la colección dueña vienen embebidos en la respuesta
   * del search (`embed=thumbnail,owningCollection`), sin una petición por item.
   */
  private loadItemDetails(items: Item[]) {
    this.searchState.results.set(
      items.map((item) => ({
        id: item.uuid,
        name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
        description: item.metadata?.['dc.description.abstract']?.[0]?.value || '',
        dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
        handle: item.handle,
        coverImage: item.thumbnail?.uuid
          ? `/server/api/core/bitstreams/${item.thumbnail.uuid}/content`
          : this.dspaceApi.getThumbnailUrl(item.uuid),
        bitstreams: [],
        type: item.metadata?.['dc.type']?.[0]?.value || '',
        relationUri: item.metadata?.['dc.relation.uri']?.[0]?.value || '',
        owningCollectionUuid: item.owningCollection?.uuid,
      })),
    );
    this.searchState.isSearching.set(false);
  }
}
