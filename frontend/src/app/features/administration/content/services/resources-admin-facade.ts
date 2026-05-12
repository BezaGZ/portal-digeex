import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

import { DiscoveryService } from '../../../../core/api/discovery.service';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { Community } from '../../../../core/api/models/community.model';
import { FacetFilter } from '../../../../core/api/models/discovery.model';
import { Paginated } from '../../../../core/api/models/hal.model';
import { MyDSpaceObject } from '../../../../core/api/models/my-dspace.model';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { findCallerSub } from '../../shared/services/scope-resolver';

export interface ResourcesAdminSearchOpts {
  withdrawn: boolean;
  query?: string;
  dateFrom?: number;
  dateTo?: number;
  entityType?: string;
  sort?: string;
  page?: number;
  size?: number;
}

/**
 * Facade del listado admin de recursos (`/administrador/recursos`).
 * Resuelve scope per-rol (SuperAdmin global; admin_subdireccion acotado a
 * su sub-community via `digeex.sufijo`) y delega a Discovery con
 * `configuration=administrativeView`, que sí devuelve items withdrawn.
 */
@Injectable({ providedIn: 'root' })
export class ResourcesAdminFacade {
  private readonly discovery = inject(DiscoveryService);
  private readonly communityApi = inject(CommunityApiService);
  private readonly authCaller = inject(AuthCallerService);

  search$(opts: ResourcesAdminSearchOpts): Observable<Paginated<MyDSpaceObject>> {
    return this.resolveScope$().pipe(
      switchMap((scope) =>
        this.discovery
          .search({
            configuration: 'administrativeView',
            scope: scope ?? undefined,
            page: opts.page,
            size: opts.size,
            sort: opts.sort,
            query: opts.query,
            filters: this.buildFilters(opts),
          })
          .pipe(
            map((result) => ({
              // Envuelve cada Item en MyDSpaceObject para que los consumidores
              // reusen los helpers compartidos (`titleOf`, `coverUrlOf`, etc.).
              items: result.items.map((item) => ({
                type: 'discover' as const,
                indexableObject: item,
              })),
              totalElements: result.totalElements,
              totalPages: result.totalPages,
              page: result.page,
              size: result.size,
            })),
          ),
      ),
    );
  }

  /**
   * Devuelve `null` para SuperAdmin (sin scope) y la community uuid para
   * admin_subdireccion. Reusa el patrón `searchTop → listSubcommunities →
   * findCallerSub` del `upload-content` component.
   */
  private resolveScope$(): Observable<string | null> {
    return this.authCaller.currentCaller$.pipe(
      take(1),
      switchMap((caller) => {
        if (!caller || caller.role === 'superadmin' || !caller.sufijo) {
          return of(null);
        }
        return this.communityApi.searchTop(0, 1).pipe(
          switchMap((rootResp) => {
            const root = rootResp._embedded?.['communities']?.[0];
            if (!root) return of(null as string | null);
            return this.communityApi.listSubcommunities(root.uuid, 0, 100).pipe(
              map((subsResp) => {
                const embedded = (subsResp._embedded ?? {}) as Record<string, Community[]>;
                const subs = embedded['subcommunities'] ?? embedded['communities'] ?? [];
                return findCallerSub(subs, caller)?.uuid ?? null;
              }),
            );
          }),
        );
      }),
    );
  }

  private buildFilters(opts: ResourcesAdminSearchOpts): FacetFilter[] {
    const filters: FacetFilter[] = [
      { name: 'withdrawn', value: opts.withdrawn ? 'true' : 'false', operator: 'equals' },
    ];
    if (opts.entityType) {
      filters.push({ name: 'entityType', value: opts.entityType, operator: 'equals' });
    }
    if (opts.dateFrom != null || opts.dateTo != null) {
      const from = opts.dateFrom ?? '*';
      const to = opts.dateTo ?? '*';
      filters.push({ name: 'dateIssued', value: `[${from} TO ${to}]`, operator: 'equals' });
    }
    return filters;
  }
}
