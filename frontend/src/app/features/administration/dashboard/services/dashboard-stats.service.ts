import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import { DiscoveryService } from '../../../../core/api/discovery.service';
import { SearchResult } from '../../../../core/api/models/discovery.model';

/**
 * Búsqueda base del dashboard compartida entre cards: el total y las facetas
 * salen del mismo response, así los widgets no repiten la misma petición a
 * Discovery. Se re-provee a nivel del Dashboard para que cada visita traiga
 * datos frescos.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStatsService {
  private readonly discovery = inject(DiscoveryService);
  private readonly cache = new Map<string, Observable<SearchResult>>();

  /** Un solo `search({size:0, dsoType:'item'})` por scope, compartido entre las cards. */
  baseSearch$(scope: string | undefined): Observable<SearchResult> {
    const key = scope ?? '';
    let shared = this.cache.get(key);
    if (!shared) {
      shared = this.discovery
        .search({ size: 0, scope, dsoType: 'item' })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.cache.set(key, shared);
    }
    return shared;
  }
}
