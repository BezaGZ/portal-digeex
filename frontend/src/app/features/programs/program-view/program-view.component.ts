import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
import { CollectionView, ItemView, PaginatorEvent } from '../../../core/api/models';
import { forkJoin, Subject, Observable } from 'rxjs';
import { map, takeUntil, switchMap } from 'rxjs/operators';
import { SkeletonCardComponent, EmptyStateComponent } from '../../../shared';

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
  ],
  templateUrl: './program-view.component.html',
})
export class ProgramViewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  currentNode: CollectionView | null = null;
  items: ItemView[] = [];
  isLoading = false;
  itemsPerPage = 8;
  currentPage = 0;
  paginatedItems: ItemView[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private breadcrumbService: BreadcrumbService,
    private dspaceApi: DSpaceApiService,
  ) {}

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const collectionUuid = params['id'];
      if (collectionUuid) {
        this.loadCollection(collectionUuid);
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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

        this.loadItems(collection.uuid);
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

  private loadItems(collectionUuid: string) {
    this.dspaceApi.getItems(collectionUuid, 0, 100).subscribe({
      next: (itemsResponse) => {
        const items = itemsResponse._embedded?.['items'] || [];

        if (items.length === 0) {
          this.items = [];
          this.currentPage = 0;
          this.updatePaginatedItems();
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

              if (thumbnailBundle) {
                return this.dspaceApi.getBitstreamsFromBundle(thumbnailBundle.uuid).pipe(
                  map((bitstreamsResponse) => {
                    const bitstreams = bitstreamsResponse._embedded?.['bitstreams'] || [];
                    const thumbnail = bitstreams[0];

                    return {
                      id: item.uuid,
                      name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
                      description: item.metadata?.['dc.description']?.[0]?.value || '',
                      dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
                      handle: item.handle,
                      coverImage: thumbnail
                        ? `/server/api/core/bitstreams/${thumbnail.uuid}/content`
                        : null,
                    } as ItemView;
                  }),
                );
              }

              const originalBundle = bundles.find((b) => b.name === 'ORIGINAL');
              if (originalBundle) {
                return this.dspaceApi.getBitstreamsFromBundle(originalBundle.uuid).pipe(
                  map((bitstreamsResponse) => {
                    const bitstreams = bitstreamsResponse._embedded?.['bitstreams'] || [];
                    const thumbnail = bitstreams.find((b) => {
                      const fileName = b.name?.toLowerCase() || '';
                      return (
                        fileName.endsWith('.jpeg') ||
                        fileName.endsWith('.jpg') ||
                        fileName.endsWith('.png')
                      );
                    });

                    return {
                      id: item.uuid,
                      name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
                      description: item.metadata?.['dc.description']?.[0]?.value || '',
                      dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
                      handle: item.handle,
                      coverImage: thumbnail
                        ? `/server/api/core/bitstreams/${thumbnail.uuid}/content`
                        : null,
                    } as ItemView;
                  }),
                );
              }

              return new Observable<ItemView>((observer) => {
                observer.next({
                  id: item.uuid,
                  name: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
                  description: item.metadata?.['dc.description']?.[0]?.value || '',
                  dateIssued: item.metadata?.['dc.date.issued']?.[0]?.value || '',
                  handle: item.handle,
                  coverImage: null,
                });
                observer.complete();
              });
            }),
          ),
        );

        forkJoin(itemsWithThumbnails$).subscribe({
          next: (itemsWithCovers) => {
            this.items = itemsWithCovers;
            this.currentPage = 0;
            this.updatePaginatedItems();
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
            }));
            this.currentPage = 0;
            this.updatePaginatedItems();
            this.isLoading = false;
            this.cdr.markForCheck();
            this.updateBreadcrumb();
          },
        });
      },
      error: (error) => {
        console.error('Error al cargar items desde DSpace:', error);
        this.items = [];
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
    this.updatePaginatedItems();
    this.cdr.markForCheck();
  }

  updatePaginatedItems() {
    const start = this.currentPage * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.paginatedItems = this.items.slice(start, end);
  }

  goBack() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
}
