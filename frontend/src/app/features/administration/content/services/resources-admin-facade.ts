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
import * as roleCaps from '../../../../core/auth/role-capabilities';

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
 * Resolución de scope per-rol. `none` es el caso fail-closed: sin sesión o sin
 * sub válida no se consulta Discovery, para no descargar items de otras subs.
 */
type Scope = { mode: 'all' } | { mode: 'scoped'; uuid: string } | { mode: 'none' };

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
      switchMap((scope) => {
        if (scope.mode === 'none') {
          return of(this.emptyPage(opts));
        }
        return this.discovery
          .search({
            configuration: 'administrativeView',
            scope: scope.mode === 'scoped' ? scope.uuid : undefined,
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
          );
      }),
    );
  }

  /** Página vacía para el caso fail-closed, sin consultar Discovery. */
  private emptyPage(opts: ResourcesAdminSearchOpts): Paginated<MyDSpaceObject> {
    return { items: [], totalElements: 0, totalPages: 0, page: opts.page ?? 0, size: opts.size ?? 0 };
  }

  /**
   * Resuelve el scope del caller. SuperAdmin → `all` (global). admin_subdireccion
   * con sufijo que matchea → `scoped` a su sub-community. Cualquier otro caso
   * —sin caller (logout), sin sufijo, o sufijo que no matchea— → `none`, que el
   * `search$` traduce a lista vacía sin consultar Discovery (fail-closed). Reusa
   * el patrón `searchTop → listSubcommunities → findCallerSub`.
   */
  private resolveScope$(): Observable<Scope> {
    return this.authCaller.currentCaller$.pipe(
      take(1),
      switchMap((caller) => {
        if (!caller) return of<Scope>({ mode: 'none' });
        if (roleCaps.isSuperadmin(caller)) return of<Scope>({ mode: 'all' });
        if (!caller.sufijo) return of<Scope>({ mode: 'none' });
        return this.communityApi.searchTop(0, 1).pipe(
          switchMap((rootResp) => {
            const root = rootResp._embedded?.['communities']?.[0];
            if (!root) return of<Scope>({ mode: 'none' });
            return this.communityApi.listSubcommunities(root.uuid, 0, 100).pipe(
              map((subsResp) => {
                const embedded = (subsResp._embedded ?? {}) as Record<string, Community[]>;
                const subs = embedded['subcommunities'] ?? embedded['communities'] ?? [];
                const uuid = findCallerSub(subs, caller)?.uuid;
                return uuid ? ({ mode: 'scoped', uuid } as Scope) : ({ mode: 'none' } as Scope);
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
