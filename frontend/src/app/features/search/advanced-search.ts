import { Component, ChangeDetectionStrategy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PaginatorModule } from 'primeng/paginator';
import { forkJoin, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { DiscoveryService } from '../../core/api/discovery.service';
import { SearchResult } from '../../core/api/models/discovery.model';
import { Item } from '../../core/api/models/item.model';
import { Bitstream } from '../../core/api/models/bitstream.model';
import { ItemView, BitstreamView, PaginatorEvent } from '../../core/api/models/view.model';
import { DSpaceApiService } from '../../core/api/dspace-api.service';
import { DocumentCardComponent, SkeletonCardComponent, EmptyStateComponent } from '../../shared';
import { SearchFiltersComponent } from './components/search-filters/search-filters';
import { SearchFilters } from './models/search-filters.model';

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
  isSearching = signal(false);
  hasSearched = signal(false);
  results = signal<ItemView[]>([]);
  totalElements = signal(0);
  documentCollectionUuids = signal<string[]>([]);
  comunidadesOptions = signal<{ label: string; value: string }[]>([]);

  itemsPerPage = 10;
  currentPage = 0;

  private currentFilters: SearchFilters | null = null;
  private allItems: Item[] = [];

  constructor(
    private discoveryService: DiscoveryService,
    private dspaceApi: DSpaceApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadDocumentCollections();
  }

  onSearch(filters: SearchFilters) {
    this.currentFilters = filters;
    this.currentPage = 0;
    this.executeSearch();
  }

  onClear() {
    this.currentFilters = null;
    this.currentPage = 0;
    this.executeSearch();
  }

  onPageChange(event: PaginatorEvent) {
    this.currentPage = event.page ?? 0;
    this.showCurrentPage();
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

  private loadDocumentCollections() {
    this.dspaceApi.getAllCollections(0, 100).subscribe((response) => {
      const collections = response._embedded?.['collections'] || [];
      const documentCollections = collections.filter(
        (c) => c.metadata?.['dc.format']?.[0]?.value === 'documento'
      );
      const uuids = documentCollections.map((c) => c.uuid);
      this.documentCollectionUuids.set(uuids);
      this.comunidadesOptions.set(
        documentCollections.map((c) => ({
          label: c.metadata?.['dc.title']?.[0]?.value || c.name,
          value: c.uuid,
        }))
      );

      if (uuids.length > 0) {
        this.executeSearch();
      }
    });
  }

  private executeSearch() {
    this.isSearching.set(true);
    this.hasSearched.set(true);

    const allUuids = this.documentCollectionUuids();
    const filters = this.currentFilters;

    const selected = filters && (filters.comunidades?.length ?? 0) > 0
      ? filters.comunidades
      : allUuids;

    if (selected.length === 0) {
      this.isSearching.set(false);
      return;
    }

    const baseParams = {
      query: filters?.query || undefined,
      sort: filters ? this.mapSort(filters.orderBy) : undefined,
      page: 0,
      size: 100,
    };

    if (selected.length === 1) {
      this.discoveryService.search({ ...baseParams, scope: selected[0] })
        .subscribe((result: SearchResult) => {
          this.allItems = result.items;
          this.showCurrentPage();
        });
    } else {
      const searches = selected.map((scope) =>
        this.discoveryService.search({ ...baseParams, scope })
      );

      forkJoin(searches).subscribe((results: SearchResult[]) => {
        this.allItems = results.flatMap((r) => r.items);
        this.showCurrentPage();
      });
    }
  }

  private showCurrentPage() {
    const filtered = this.applyClientFilters(this.allItems);
    this.totalElements.set(filtered.length);

    const start = this.currentPage * this.itemsPerPage;
    const pageItems = filtered.slice(start, start + this.itemsPerPage);

    if (pageItems.length === 0) {
      this.results.set([]);
      this.isSearching.set(false);
      return;
    }

    this.isSearching.set(true);
    this.loadItemDetails(pageItems);
  }

  private applyClientFilters(items: Item[]): Item[] {
    const filters = this.currentFilters;
    if (!filters) return items;

    return items.filter((item) => {
      if (filters.tipoDocumento?.length > 0) {
        const itemType = item.metadata?.['dc.type']?.[0]?.value || '';
        if (!filters.tipoDocumento.includes(itemType)) return false;
      }

      if (filters.nivelEducativo?.length > 0) {
        const itemAudience = item.metadata?.['dc.audience']?.[0]?.value || '';
        if (!filters.nivelEducativo.includes(itemAudience)) return false;
      }

      if (filters.idioma?.length > 0) {
        const itemLang = item.metadata?.['dc.language.iso']?.[0]?.value || '';
        if (!filters.idioma.includes(itemLang)) return false;
      }

      if (filters.autorArea) {
        const authors = item.metadata?.['dc.contributor.author'] || [];
        const match = authors.some((a) =>
          a.value?.toLowerCase().includes(filters.autorArea.toLowerCase())
        );
        if (!match) return false;
      }

      if (filters.anioInicio || filters.anioFin) {
        const dateStr = item.metadata?.['dc.date.issued']?.[0]?.value || '';
        const itemYear = parseInt(dateStr.substring(0, 4), 10);
        if (isNaN(itemYear)) return false;
        if (filters.anioInicio && itemYear < filters.anioInicio.getFullYear()) return false;
        if (filters.anioFin && itemYear > filters.anioFin.getFullYear()) return false;
      }

      return true;
    });
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
      next: (itemsWithCovers) => {
        this.results.set(itemsWithCovers);
        this.isSearching.set(false);
      },
      error: (error) => {
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
