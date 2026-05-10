import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  DestroyRef
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
import { BitstreamDownloadService } from '../../../core/api/bitstream-download.service';
import { inferBitstreamFormat } from '../../../core/api/bitstream-format.util';
import { CollectionView, ItemView, BitstreamView, PaginatorEvent, Bitstream } from '../../../core/api/models';
import { SkeletonCardComponent, EmptyStateComponent, DocumentCardComponent } from '../../../shared';
import { switchMap } from 'rxjs/operators';
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
    SkeletonCardComponent,
    EmptyStateComponent,
    DocumentCardComponent,
  ],
  templateUrl: './program-view.component.html',
})
export class ProgramViewComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private collectionUuid = '';
  currentNode: CollectionView | null = null;
  items: ItemView[] = [];
  isLoading = false;
  itemsPerPage = 8;
  currentPage = 0;
  totalRecords = 0;
  /** Set de itemIds que están en proceso de descarga lazy; los cards los bindean a [downloading]. */
  downloadingItems = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private breadcrumbService: BreadcrumbService,
    private dspaceApi: DSpaceApiService,
    private collectionApi: CollectionApiService,
    private downloader: BitstreamDownloadService,
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
    this.isLoading = true;
    this.cdr.markForCheck();

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

        this.currentNode = {
          id: collection.uuid,
          name: collection.metadata?.['dc.subject']?.[0]?.value || collection.name,
          description: collection.metadata?.['dc.title']?.[0]?.value || '',
          type: 'collection',
        };

        this.collectionUuid = collection.uuid;
        this.loadItems(collection.uuid, 0);
      },
      error: (error) => {
        console.error('Error al cargar colección desde DSpace:', error);
        this.currentNode = {
          id: collectionUuid,
          name: 'Error',
          description: 'No se pudo cargar el contenido',
          type: 'collection',
        };
        this.items = [];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadItems(collectionUuid: string, page: number) {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.dspaceApi.getItems(collectionUuid, page, this.itemsPerPage).subscribe({
      next: (itemsResponse) => {
        const items = itemsResponse._embedded?.['items'] || [];
        this.totalRecords = itemsResponse.page?.totalElements ?? 0;

        // El thumbnail viene embebido en cada item; los bitstreams se
        // consultan solo al click "Descargar" en el card.
        this.items = items.map((item) => ({
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
        }));
        this.isLoading = false;
        this.cdr.markForCheck();
        this.updateBreadcrumb();
      },
      error: (error) => {
        console.error('Error al cargar items desde DSpace:', error);
        this.items = [];
        this.totalRecords = 0;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private updateBreadcrumb() {
    if (!this.currentNode) return;

    const ancestorTrail: MenuItem[] = history.state?.trail || [];
    this.breadcrumbService.setTrail([
      ...ancestorTrail,
      { label: this.currentNode.name, routerLink: this.router.url },
    ]);
  }

  navigateToDocument(item: ItemView) {
    if (!this.currentNode) return;

    const currentTrail: MenuItem[] = this.breadcrumbService.trail();
    this.router.navigate(['/programas', this.currentNode.id, 'documentos', item.id], {
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
    return this.downloadingItems.has(itemId);
  }

  onDownloadItem(item: ItemView): void {
    if (this.downloadingItems.has(item.id)) return;
    this.downloadingItems.add(item.id);
    this.cdr.markForCheck();

    this.dspaceApi
      .getBundles(item.id)
      .pipe(
        switchMap((bundlesResponse) => {
          const bundles = bundlesResponse._embedded?.['bundles'] || [];
          const original = bundles.find((b) => b.name === 'ORIGINAL');
          if (!original) {
            return Promise.resolve([] as BitstreamView[]);
          }
          return this.dspaceApi.getBitstreamsFromBundle(original.uuid).toPromise().then((res) => {
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
          });
        }),
      )
      .subscribe({
        next: async (bitstreams) => {
          await this.downloader.downloadAuto(bitstreams, item.name || 'documento');
          this.downloadingItems.delete(item.id);
          this.cdr.markForCheck();
        },
        error: () => {
          this.downloadingItems.delete(item.id);
          this.cdr.markForCheck();
        },
      });
  }

  goBack() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
}
