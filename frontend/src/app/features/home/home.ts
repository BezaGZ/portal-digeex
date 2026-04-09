import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CollectionCacheService } from '../../core/api/collection-cache.service';
import { CollectionView, ItemView } from '../../core/api/models';
import { getCollectionRoute } from '../../core/config/collection-format.config';
import { SkeletonCardComponent, EmptyStateComponent } from '../../shared';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, SkeletonCardComponent, EmptyStateComponent],
  templateUrl: './home.html',
})
export class Home implements OnInit {
  children: CollectionView[] = [];
  items: ItemView[] = [];
  isLoading = false;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private collectionCache: CollectionCacheService,
  ) {}

  ngOnInit() {
    this.loadRootContent();
  }

  loadRootContent() {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.collectionCache.getByMenuType('menu-principal').subscribe({
      next: (menuCollections) => {
        this.children = menuCollections.map((collection) => ({
          id: collection.uuid,
          name: collection.metadata?.['dc.subject']?.[0]?.value || collection.name,
          description: collection.metadata?.['dc.title']?.[0]?.value || '',
          type: 'collection',
          format: collection.metadata?.['dc.format']?.[0]?.value || 'documento',
        }));

        this.items = [];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar collections desde DSpace:', error);
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  navigateToChild(child: CollectionView) {
    this.router.navigateByUrl(getCollectionRoute(child.format || 'documento', child.id));
  }

  navigateToDocument(item: ItemView) {
    this.router.navigate(['/documentos', item.id]);
  }

  getIcon(type: string): string {
    switch (type) {
      case 'community':
        return 'pi pi-folder';
      case 'collection':
        return 'pi pi-list';
      default:
        return 'pi pi-file';
    }
  }
}
