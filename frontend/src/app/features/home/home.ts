import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DSpaceApiService } from '../../core/api/dspace-api.service';
import { CollectionView, ItemView } from '../../core/api/models';
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
    private dspaceApi: DSpaceApiService,
  ) {}

  ngOnInit() {
    this.loadRootContent();
  }

  loadRootContent() {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.dspaceApi.getAllCollections(0, 100).subscribe({
      next: (response) => {
        const collections = response._embedded?.['collections'] || [];

        const menuCollections = collections.filter((collection) => {
          const type = collection.metadata?.['dc.type']?.[0]?.value;
          return type === 'menu-principal';
        });

        menuCollections.sort((a, b) => {
          const orderA = parseInt(a.metadata?.['dc.identifier.other']?.[0]?.value || '999');
          const orderB = parseInt(b.metadata?.['dc.identifier.other']?.[0]?.value || '999');
          return orderA - orderB;
        });

        this.children = menuCollections.map((collection) => ({
          id: collection.uuid,
          name: collection.metadata?.['dc.subject']?.[0]?.value || collection.name,
          description: collection.metadata?.['dc.title']?.[0]?.value || '',
          type: 'collection',
          handle: collection.handle,
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
    this.router.navigate(['/programas', child.id]);
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
