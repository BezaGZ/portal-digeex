import { Component, ChangeDetectionStrategy, OnInit, signal, ViewChild } from '@angular/core';
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

  isSearching = signal(false);
  isLoadingFacets = signal(false);
  hasSearched = signal(false);
  results = signal<ItemView[]>([]);
  totalElements = signal(0);
  scopeOptions = signal<ScopeOption[]>([]);

  itemsPerPage = 10;
  currentPage = 0;

  private currentFilters: SearchFilters | null = null;
  private currentScope = '';

  /** UUID de la community raíz DIGEEX — se detecta dinámicamente */
  private digeexCommunityUuid = '';

  constructor(
    private discoveryService: DiscoveryService,
    private dspaceApi: DSpaceApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadScopeOptions();
  }

  onScopeChange(scopeUuid: string) {
    this.currentScope = scopeUuid;
    this.currentFilters = null;
    this.hasSearched.set(false);
    this.results.set([]);
    this.totalElements.set(0);
    this.loadFacetsForScope(scopeUuid);
  }

  onSearch(filters: SearchFilters) {
    this.currentFilters = filters;
    this.currentPage = 0;
    this.executeSearch();
  }

  onClear() {
    this.currentFilters = null;
    this.currentPage = 0;
    this.results.set([]);
    this.totalElements.set(0);
    this.hasSearched.set(false);
  }

  onPageChange(event: PaginatorEvent) {
    this.currentPage = event.page ?? 0;
    this.executeSearch();
  }

  navigateToDocument(item: ItemView) {
    this.router.navigate(['/documentos', item.id]);
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
          { label: 'Todos los programas (DIGEEX)', value: digeex.uuid },
        ];

        let remaining = subCommunities.length;
        if (remaining === 0) {
          this.scopeOptions.set(options);
          return;
        }

        for (const sub of subCommunities) {
          const subName = sub.metadata?.['dc.title']?.[0]?.value || sub.name;

          options.push({
            label: `${subName} (todos)`,
            value: sub.uuid,
            group: subName,
          });

          this.dspaceApi.getCollections(sub.uuid, 0, 20).subscribe((colResponse) => {
            const collections = colResponse._embedded?.['collections'] || [];
            for (const col of collections) {
              const format = col.metadata?.['dc.format']?.[0]?.value;
              if (format === 'documento') {
                options.push({
                  label: col.metadata?.['dc.title']?.[0]?.value || col.name,
                  value: col.uuid,
                  group: subName,
                });
              }
            }

            remaining--;
            if (remaining === 0) {
              this.scopeOptions.set(options);
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

    this.discoveryService.search({
      scope: scopeUuid,
      size: 0,
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
    const filters = this.currentFilters;
    const scope = filters?.scope || this.currentScope;

    if (!scope) return;

    this.isSearching.set(true);
    this.hasSearched.set(true);

    const facetFilters = this.buildFacetFilters(filters);

    this.discoveryService.search({
      scope,
      query: filters?.query || undefined,
      sort: filters ? this.mapSort(filters.orderBy) : undefined,
      filters: facetFilters.length > 0 ? facetFilters : undefined,
      page: this.currentPage,
      size: this.itemsPerPage,
    }).pipe(
      catchError((error) => {
        console.error('Error en búsqueda:', error);
        this.results.set([]);
        this.totalElements.set(0);
        this.isSearching.set(false);
        return EMPTY;
      }),
    ).subscribe((result: SearchResult) => {
      this.totalElements.set(result.totalElements);
      this.loadItemDetails(result.items);
    });
  }

  private buildFacetFilters(filters: SearchFilters | null): FacetFilter[] {
    if (!filters) return [];
    const facets: FacetFilter[] = [];

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
      this.results.set([]);
      this.isSearching.set(false);
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

          return forkJoin({ thumbnail: thumbnail$, original: original$ }).pipe(
            map(({ thumbnail, original }) => {
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
              } as ItemView;
            }),
          );
        }),
      ),
    );

    forkJoin(itemsWithDetails$).subscribe({
      next: (itemsWithCovers: ItemView[]) => {
        this.results.set(itemsWithCovers);
        this.isSearching.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al cargar bitstreams:', error);
        this.results.set(items.map((item) => ({
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
        this.isSearching.set(false);
      },
    });
  }
}
