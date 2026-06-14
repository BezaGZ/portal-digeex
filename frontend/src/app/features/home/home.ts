import { Component, ChangeDetectionStrategy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CollectionCacheService } from '../../core/api/collection-cache.service';
import { extractLogoUrl } from '../../core/api/collection-logo.util';
import { CollectionView, ItemView } from '../../core/api/models';
import { getCollectionRoute } from '../../core/config/collection-format.config';
import { NAV_LOCATION, ENTITY_TYPE } from '../../core/config/digeex-values.config';
import { SkeletonCardComponent, EmptyStateComponent } from '../../shared';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, SkeletonCardComponent, EmptyStateComponent],
  templateUrl: './home.html',
})
export class Home implements OnInit {
  readonly children = signal<CollectionView[]>([]);
  readonly items = signal<ItemView[]>([]);
  readonly isLoading = signal(false);

  constructor(
    private router: Router,
    private collectionCache: CollectionCacheService,
  ) {}

  ngOnInit() {
    this.loadRootContent();
  }

  loadRootContent() {
    this.isLoading.set(true);

    this.collectionCache.getByMenuType(NAV_LOCATION.MENU_PRINCIPAL).subscribe({
      next: (menuCollections) => {
        this.children.set(menuCollections.map((collection) => ({
          id: collection.uuid,
          name: collection.metadata?.['dc.title.alternative']?.[0]?.value || collection.name,
          description: collection.metadata?.['dc.title']?.[0]?.value || '',
          type: 'collection',
          format: collection.metadata?.['dspace.entity.type']?.[0]?.value || ENTITY_TYPE.DOCUMENTO,
          logoUrl: extractLogoUrl(collection),
        })));

        this.items.set([]);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error al cargar collections desde DSpace:', error);
        this.isLoading.set(false);
      },
    });
  }

  navigateToChild(child: CollectionView) {
    this.router.navigateByUrl(getCollectionRoute(child.format || ENTITY_TYPE.DOCUMENTO, child.id));
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
