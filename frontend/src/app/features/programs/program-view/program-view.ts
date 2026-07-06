import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  DestroyRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { DataViewModule } from 'primeng/dataview';
import { PaginatorModule } from 'primeng/paginator';
import { ButtonModule } from 'primeng/button';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { StatisticsTrackingService } from '../../../core/api/statistics-tracking.service';
import { BitstreamDownloadService } from '../../../core/api/bitstream-download.service';
import { inferBitstreamFormat } from '../../../core/api/bitstream-format.util';
import { CollectionView, ItemView, BitstreamView, PaginatorEvent, Bitstream } from '../../../core/api/models';
import { SkeletonCard, EmptyState, DocumentCardComponent } from '../../../shared';
import { switchMap } from 'rxjs/operators';
import { lastValueFrom } from 'rxjs';
import { paginateAll$ } from '../../../core/api/dspace-rest.util';
import { getCollectionRoute } from '../../../core/config/collection-format.config';
import { ENTITY_TYPE } from '../../../core/config/digeex-values.config';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-program-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CardModule,
    DataViewModule,
    PaginatorModule,
    ButtonModule,
    SkeletonCard,
    EmptyState,
    DocumentCardComponent,
  ],
  templateUrl: './program-view.html',
})
export class ProgramView implements OnInit {
  private destroyRef = inject(DestroyRef);
  private collectionUuid = '';
  readonly currentNode = signal<CollectionView | null>(null);
  readonly items = signal<ItemView[]>([]);
  readonly isLoading = signal(false);
  itemsPerPage = 8;
  currentPage = 0;
  readonly totalRecords = signal(0);
  /** Set de itemIds que están en proceso de descarga lazy; los cards los bindean a [downloading]. */
  readonly downloadingItems = signal(new Set<string>());

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private breadcrumbService: BreadcrumbService,
    private dspaceApi: DSpaceApiService,
    private collectionApi: CollectionApiService,
    private downloader: BitstreamDownloadService,
    private tracking: StatisticsTrackingService,
  ) {}

  ngOnInit() {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const collectionUuid = params['id'];
      if (collectionUuid) {
        this.loadCollection(collectionUuid);
      }
    });
  }

  private loadCollection(collectionUuid: string) {
    this.isLoading.set(true);

    this.collectionApi.getOne(collectionUuid).subscribe({
      next: (collection) => {
        const format = collection.metadata?.['dspace.entity.type']?.[0]?.value || ENTITY_TYPE.DOCUMENTO;
        if (format !== ENTITY_TYPE.DOCUMENTO) {
          this.router.navigateByUrl(
            getCollectionRoute(format, collection.uuid),
            { replaceUrl: true }
          );
          return;
        }

        // Registra la visita al programa en Solr Statistics (best-effort).
        this.tracking
          .trackView$(collection.uuid, 'collection')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.currentNode.set({
          id: collection.uuid,
          name: collection.metadata?.['dc.title.alternative']?.[0]?.value || collection.name,
          description: collection.metadata?.['dc.title']?.[0]?.value || '',
          type: 'collection',
        });

        this.collectionUuid = collection.uuid;
        this.loadItems(collection.uuid, 0);
      },
      error: (error) => {
        console.error('Error al cargar colección desde DSpace:', error);
        this.currentNode.set({
          id: collectionUuid,
          name: 'Error',
          description: 'No se pudo cargar el contenido',
          type: 'collection',
        });
        this.items.set([]);
        this.isLoading.set(false);
      },
    });
  }

  private loadItems(collectionUuid: string, page: number) {
    this.isLoading.set(true);

    this.dspaceApi.getItems(collectionUuid, page, this.itemsPerPage).subscribe({
      next: (itemsResponse) => {
        const items = itemsResponse._embedded?.['items'] || [];
        this.totalRecords.set(itemsResponse.page?.totalElements ?? 0);

        // El thumbnail viene embebido en cada item; los bitstreams se
        // consultan solo al click "Descargar" en el card.
        this.items.set(items.map((item) => ({
          id: item.uuid,
          name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
          description: item.metadata?.['dc.description']?.[0]?.value || '',
          dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
          handle: item.handle,
          coverImage: item.thumbnail?.uuid
            ? `/server/api/core/bitstreams/${item.thumbnail.uuid}/content`
            : this.dspaceApi.getThumbnailUrl(item.uuid),
          bitstreams: [],
          type: item.metadata?.['dc.type']?.[0]?.value || '',
          relationUri: item.metadata?.['dc.relation.uri']?.[0]?.value || '',
        })));
        this.isLoading.set(false);
        this.updateBreadcrumb();
      },
      error: (error) => {
        console.error('Error al cargar items desde DSpace:', error);
        this.items.set([]);
        this.totalRecords.set(0);
        this.isLoading.set(false);
      },
    });
  }

  private updateBreadcrumb() {
    const node = this.currentNode();
    if (!node) return;

    const ancestorTrail: MenuItem[] = history.state?.trail || [];
    this.breadcrumbService.setTrail([
      ...ancestorTrail,
      { label: node.name, routerLink: this.router.url },
    ]);
  }

  navigateToDocument(item: ItemView) {
    const node = this.currentNode();
    if (!node) return;

    const currentTrail: MenuItem[] = this.breadcrumbService.trail();
    this.router.navigate(['/programas', node.id, 'recurso', item.id], {
      state: { trail: currentTrail },
    });
  }

  onPageChange(event: PaginatorEvent) {
    this.currentPage = event.page ?? 0;
    this.loadItems(this.collectionUuid, this.currentPage);
  }

  openVideo(item: ItemView) {
    if (item.relationUri) {
      window.open(item.relationUri, '_blank', 'noopener');
    }
  }

  /**
   * Click "Descargar" en el card. Hace lazy lookup del bundle ORIGINAL del
   * item, mapea bitstreams, y delega al BitstreamDownloadService que decide
   * single vs ZIP. Marca el itemId en downloadingItems para que el card
   * muestre el [loading] del p-button mientras llega la respuesta.
   */
  isDownloading(itemId: string): boolean {
    return this.downloadingItems().has(itemId);
  }

  onDownloadItem(item: ItemView): void {
    if (this.downloadingItems().has(item.id)) return;
    this.downloadingItems.update((set) => new Set(set).add(item.id));

    this.dspaceApi
      .getBundles(item.id)
      .pipe(
        switchMap((bundlesResponse) => {
          const bundles = bundlesResponse._embedded?.['bundles'] || [];
          const original = bundles.find((b) => b.name === 'ORIGINAL');
          if (!original) {
            return Promise.resolve([] as BitstreamView[]);
          }
          return lastValueFrom(
            paginateAll$(
              (page) => this.dspaceApi.getBitstreamsFromBundle(original.uuid, page, 100),
              (res) => res._embedded?.['bitstreams'] ?? [],
            ),
          ).then((list) => {
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
          });
        }),
      )
      .subscribe({
        next: async (bitstreams) => {
          await this.downloader.downloadAuto(bitstreams, item.name || 'documento');
          this.removeFromDownloading(item.id);
        },
        error: () => {
          this.removeFromDownloading(item.id);
        },
      });
  }

  /** Quita el itemId del set de descargas creando un Set nuevo (el signal detecta el cambio por referencia). */
  private removeFromDownloading(itemId: string): void {
    this.downloadingItems.update((set) => {
      const next = new Set(set);
      next.delete(itemId);
      return next;
    });
  }

  goBack() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
}
