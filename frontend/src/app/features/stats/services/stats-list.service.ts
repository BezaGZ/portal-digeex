import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { ENTITY_TYPE } from '../../../core/config/digeex-values.config';
import { Item } from '../../../core/api/models/item.model';
import { StatsItem, StatsItemPage } from '../models/stats-item.model';

/**
 * Servicio del listado público de Estadística. Busca items con
 * `dspace.entity.type = 'Estadistica'` usando Discovery (Solr) con scope en
 * la colección correspondiente y los mapea a `StatsItem` (resumen ligero sin
 * bitstream). Paralelo a `GalleryService.searchAlbums` pero más simple
 * porque no descarga thumbnails ni cuenta bitstreams: el Excel se carga lazy
 * al entrar al detalle (CA-07).
 */
@Injectable({ providedIn: 'root' })
export class StatsListService {
  private readonly collectionCache = inject(CollectionCacheService);
  private readonly discovery = inject(DiscoveryService);

  /**
   * Devuelve el UUID de la colección con `dspace.entity.type = 'Estadistica'`.
   * Lo usan el container para registrar visitas en `viewevents` y `searchStats`
   * para acotar el scope de Discovery.
   */
  getStatsCollectionUuid$(): Observable<string> {
    return this.collectionCache.findByFormat(ENTITY_TYPE.ESTADISTICA);
  }

  /**
   * Busca items Estadística paginados dentro de una colección. Si
   * `collectionUuid` viene, lo usa como scope directo; si no, resuelve la
   * primera colección con `dspace.entity.type = 'Estadistica'` vía el cache.
   * Si la colección no existe (entorno limpio o `setup-dspace.sh` no corrió),
   * retorna página vacía en vez de lanzar para que la vista pública degrade
   * limpio.
   */
  searchStats(page = 0, size = 12, collectionUuid?: string): Observable<StatsItemPage> {
    const scope$ = collectionUuid ? of(collectionUuid) : this.getStatsCollectionUuid$();
    return scope$.pipe(
      switchMap((collectionUuid) =>
        this.discovery.search({ scope: collectionUuid, page, size }).pipe(
          map((result) => ({
            items: result.items.map((item) => this.mapItemToStatsItem(item)),
            totalElements: result.totalElements,
            totalPages: result.totalPages,
            page,
            size,
          })),
        ),
      ),
      catchError(() => of(this.emptyPage(page, size))),
    );
  }

  private mapItemToStatsItem(item: Item): StatsItem {
    const md = item.metadata ?? {};
    return {
      uuid: item.uuid,
      title: md['dc.title']?.[0]?.value ?? 'Sin título',
      abstract: md['dc.description.abstract']?.[0]?.value ?? '',
      dataset: md['digeex.statsDataset']?.[0]?.value ?? '',
      issued: md['dc.date.issued']?.[0]?.value ?? '',
    };
  }

  private emptyPage(page: number, size: number): StatsItemPage {
    return { items: [], totalElements: 0, totalPages: 0, page, size };
  }
}
