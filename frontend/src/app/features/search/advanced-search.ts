import { Component, ChangeDetectionStrategy, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PaginatorModule } from 'primeng/paginator';
import { forkJoin, of, EMPTY } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { DiscoveryService } from '../../core/api/discovery.service';
import { SearchResult, FacetFilter } from '../../core/api/models/discovery.model';
import { Item } from '../../core/api/models/item.model';
import { Bitstream } from '../../core/api/models/bitstream.model';
import { ItemView, BitstreamView, PaginatorEvent } from '../../core/api/models/view.model';
import { DSpaceApiService } from '../../core/api/dspace-api.service';
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
  private readonly router = inject(Router);
  private readonly searchState = inject(SearchStateService);

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
    /* Si el servicio guarda un scope previo, el usuario regresó del detalle
       de un item y queremos restaurar la búsqueda. Si las opciones del
       scope ya están cacheadas, las reusamos; si no, recargamos. Después
       repoblamos las facetas y disparamos la búsqueda con los filtros
       guardados para repintar resultados. */
    if (this.searchState.scope()) {
      if (this.searchState.scopeOptions().length === 0) {
        this.loadScopeOptions();
      }
      this.loadFacetsForScope(this.searchState.scope());
      this.executeSearch();
    } else {
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

  downloadBitstream(bitstream: BitstreamView) {
    const link = document.createElement('a');
    link.href = bitstream.url;
    link.download = bitstream.name;
    link.click();
  }

  /**
   * Carga opciones de ámbito: sub-comunidades como grupos, colecciones como programas individuales.
   * También agrega una opción "Todos los programas" usando el UUID de la comunidad raíz DIGEEX.
   */
  private loadScopeOptions() {
    this.dspaceApi.getCommunities(0, 10).subscribe((response) => {
      const communities = response._embedded?.['communities'] || [];
      const digeex = communities.find(
        (c) =>
          c.name?.includes('DIGEEX') ||
          c.metadata?.['dc.title']?.[0]?.value?.includes('DIGEEX') ||
          c.metadata?.['dc.title']?.[0]?.value?.includes('Extraescolar')
      );

      if (!digeex) return;
      this.digeexCommunityUuid = digeex.uuid;

      this.dspaceApi.getSubcommunities(digeex.uuid, 0, 20).subscribe((subResponse) => {
        const subCommunities = subResponse._embedded?.['subcommunities'] || [];
        const options: ScopeOption[] = [
          { label: 'Todos los programas (DIGEEX)', value: digeex.uuid, scopeType: 'community' },
        ];

        let remaining = subCommunities.length;
        if (remaining === 0) {
          this.searchState.scopeOptions.set(options);
          return;
        }

        for (const sub of subCommunities) {
          const subName = sub.metadata?.['dc.title']?.[0]?.value || sub.name;

          options.push({
            label: `${subName} (todos)`,
            value: sub.uuid,
            group: subName,
            scopeType: 'community',
          });

          this.dspaceApi.getCollections(sub.uuid, 0, 20).subscribe((colResponse) => {
            const collections = colResponse._embedded?.['collections'] || [];
            for (const col of collections) {
              const format = col.metadata?.['dspace.entity.type']?.[0]?.value;
              if (format === ENTITY_TYPE.DOCUMENTO) {
                options.push({
                  label: col.metadata?.['dc.title']?.[0]?.value || col.name,
                  value: col.uuid,
                  group: subName,
                  scopeType: 'collection',
                });
              }
            }

            remaining--;
            if (remaining === 0) {
              this.searchState.scopeOptions.set(options);
            }
          });
        }
      });
    });
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

  private loadItemDetails(items: Item[]) {
    if (items.length === 0) {
      this.searchState.results.set([]);
      this.searchState.isSearching.set(false);
      return;
    }

    const itemsWithDetails$ = items.map((item) =>
      this.dspaceApi.getBundles(item.uuid).pipe(
        switchMap((bundlesResponse) => {
          const bundles = bundlesResponse._embedded?.['bundles'] || [];
          const thumbnailBundle = bundles.find((b) => b.name === 'THUMBNAIL');
          const originalBundle = bundles.find((b) => b.name === 'ORIGINAL');

          const thumbnail$ = thumbnailBundle
            ? this.dspaceApi.getBitstreamsFromBundle(thumbnailBundle.uuid)
            : of(null);
          const original$ = originalBundle
            ? this.dspaceApi.getBitstreamsFromBundle(originalBundle.uuid)
            : of(null);

          /* Resolvemos la colección dueña en paralelo para construir la URL
             canónica del detalle (/programas/{collectionUuid}/documentos/...).
             catchError protege la búsqueda si el item es huérfano o el endpoint
             responde 404; en ese caso simplemente no se llena el campo. */
          const owningCollection$ = this.dspaceApi.getOwningCollectionOfItem(item.uuid).pipe(
            catchError(() => of(null)),
          );

          return forkJoin({ thumbnail: thumbnail$, original: original$, owningCollection: owningCollection$ }).pipe(
            map(({ thumbnail, original, owningCollection }) => {
              const originalBitstreams = original?._embedded?.['bitstreams'] || [];
              const downloadableBitstreams: BitstreamView[] = originalBitstreams.map((b: Bitstream) => {
                const fileName = b.name?.toLowerCase() || '';
                let format = 'application/octet-stream';
                if (fileName.endsWith('.pdf')) format = 'application/pdf';
                else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) format = 'image/jpeg';
                else if (fileName.endsWith('.png')) format = 'image/png';

                return {
                  name: b.name || '',
                  url: `/server/api/core/bitstreams/${b.uuid}/content`,
                  size: b.sizeBytes || 0,
                  format,
                  uuid: b.uuid,
                };
              });

              const thumbnailBitstreams = thumbnail?._embedded?.['bitstreams'] || [];
              let coverImage: string | null = null;

              if (thumbnailBitstreams.length > 0) {
                coverImage = `/server/api/core/bitstreams/${thumbnailBitstreams[0].uuid}/content`;
              } else {
                const imageBitstream = originalBitstreams.find((b: Bitstream) => {
                  const fileName = b.name?.toLowerCase() || '';
                  return fileName.endsWith('.jpeg') || fileName.endsWith('.jpg') || fileName.endsWith('.png');
                });
                if (imageBitstream) {
                  coverImage = `/server/api/core/bitstreams/${imageBitstream.uuid}/content`;
                }
              }

              return {
                id: item.uuid,
                name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
                description: item.metadata?.['dc.description.abstract']?.[0]?.value || '',
                dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
                handle: item.handle,
                coverImage,
                bitstreams: downloadableBitstreams,
                type: item.metadata?.['dc.type']?.[0]?.value || '',
                relationUri: item.metadata?.['dc.relation.uri']?.[0]?.value || '',
                owningCollectionUuid: owningCollection?.uuid,
              } as ItemView;
            }),
          );
        }),
      ),
    );

    forkJoin(itemsWithDetails$).subscribe({
      next: (itemsWithCovers: ItemView[]) => {
        this.searchState.results.set(itemsWithCovers);
        this.searchState.isSearching.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al cargar bitstreams:', error);
        this.searchState.results.set(items.map((item) => ({
          id: item.uuid,
          name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
          description: item.metadata?.['dc.description.abstract']?.[0]?.value || '',
          dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
          handle: item.handle,
          coverImage: null,
          bitstreams: [],
          type: item.metadata?.['dc.type']?.[0]?.value || '',
          relationUri: item.metadata?.['dc.relation.uri']?.[0]?.value || '',
        })));
        this.searchState.isSearching.set(false);
      },
    });
  }
}
