import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { PublicHeader } from '../public-header/public-header';
import { PublicFooter } from '../public-footer/public-footer';
import { PublicBreadcrumb } from '../public-breadcrumb/public-breadcrumb';

/**
 * Layout del portal público. Muestra un splash institucional a pantalla
 * completa mientras `CollectionCacheService.menuReady` está en false: los
 * menús principal y secundario del header se arman desde ese cache y sin
 * ellos el portal aparece a medio vestir.
 */
@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterModule, PublicHeader, PublicFooter, PublicBreadcrumb],
  templateUrl: './public-layout.html',
})
export class PublicLayout {
  private readonly collectionCache = inject(CollectionCacheService);

  /** True cuando la primera carga de colecciones del menú terminó. */
  readonly menuReady = this.collectionCache.menuReady;
}
