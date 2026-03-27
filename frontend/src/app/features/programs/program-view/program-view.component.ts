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
import { CollectionView, ItemView, BitstreamView, PaginatorEvent } from '../../../core/api/models';
import { forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SkeletonCardComponent, EmptyStateComponent, DocumentCardComponent } from '../../../shared';
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private breadcrumbService: BreadcrumbService,
    private dspaceApi: DSpaceApiService,
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

    this.dspaceApi.getCollection(collectionUuid).subscribe({
      next: (collection) => {
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

        if (items.length === 0) {
          this.items = [];
          this.isLoading = false;
          this.cdr.markForCheck();
          this.updateBreadcrumb();
          return;
        }

        const itemsWithThumbnails$ = items.map((item) =>
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
                  const downloadableBitstreams: BitstreamView[] = originalBitstreams.map((b: any) => {
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
                    const imageBitstream = originalBitstreams.find((b: any) => {
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
                    description: item.metadata?.['dc.description']?.[0]?.value || '',
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

        forkJoin(itemsWithThumbnails$).subscribe({
          next: (itemsWithCovers) => {
            this.items = itemsWithCovers;
            this.isLoading = false;
            this.cdr.markForCheck();
            this.updateBreadcrumb();
          },
          error: (error) => {
            console.error('Error al cargar bitstreams:', error);
            this.items = items.map((item) => ({
              id: item.uuid,
              name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
              description: item.metadata?.['dc.description']?.[0]?.value || '',
              dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
              handle: item.handle,
              coverImage: null,
              bitstreams: [],
              type: item.metadata?.['dc.type']?.[0]?.value || '',
              relationUri: item.metadata?.['dc.relation.uri']?.[0]?.value || '',
            }));
            this.isLoading = false;
            this.cdr.markForCheck();
            this.updateBreadcrumb();
          },
        });
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

  downloadBitstream(bitstream: BitstreamView) {
    const link = document.createElement('a');
    link.href = bitstream.url;
    link.download = bitstream.name;
    link.click();
  }

  goBack() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
}
