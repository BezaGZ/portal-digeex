import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { DSPACE_API_BASE } from './dspace-rest.util';
import { HalPage } from './models/hal.model';
import { Paginated } from './models/hal.model';
import { Bitstream } from './models/bitstream.model';
import { Item } from './models/item.model';
import { MyDSpaceObject } from './models/my-dspace.model';

/**
 * Shape literal del response de `/api/discover/search/objects?configuration=workspace`.
 *
 * Doble envoltura HAL:
 *  - El `searchResult` lleva su propia paginación dentro de `_embedded`,
 *    no al top-level.
 *  - Cada objeto del listado tiene el item real bajo `_embedded.indexableObject`
 *    (no en una propiedad top-level). El wrapper lo aplana al modelo
 *    `MyDSpaceObject` con `indexableObject` directo para que el template
 *    no tenga que conocer la envoltura HAL.
 */
/**
 * El indexableObject puede traer su propio `_embedded.thumbnail` cuando el
 * search se hace con `?embed=thumbnail`. Lo declaramos opcional para poder
 * subirlo al campo `thumbnail` del Item (top-level) sin castear.
 */
interface HalIndexableItem extends Item {
  _embedded?: { thumbnail?: Bitstream };
}

interface HalSearchObject {
  hitHighlights: unknown;
  type: 'discover';
  _links: Record<string, { href: string }>;
  _embedded: { indexableObject: HalIndexableItem };
}

interface MyDSpaceSearchResponse {
  _embedded: {
    searchResult: {
      page: HalPage;
      _embedded: {
        objects: HalSearchObject[];
      };
    };
  };
}

/**
 * Filtros opcionales que el componente de Mis envíos puede pasar. Solo se
 * exponen los facets que `workspaceConfiguration` declara nativamente en
 * `discovery.xml`: texto libre, rango `dc.date.issued` y campo de orden.
 */
export interface MyDSpaceSearchOpts {
  query?: string;
  dateFrom?: number;
  dateTo?: number;
  sort?: string;
}

/**
 * Wrapper del endpoint MyDSpace de DSpace 9.x (mismo que usa dspace-angular
 * para la bandeja personal del usuario). Combina workspaceitems, workflowitems
 * e items archivados del eperson autenticado en un solo response paginado.
 * En DIGEEX, por ahora, solo aparecen items archivados; los otros tipos se
 * incorporan al modelo cuando el flujo los devuelva.
 */
@Injectable({ providedIn: 'root' })
export class MyDSpaceApiService {
  private readonly http = inject(HttpClient);

  /** Lista paginada de los envíos del usuario logueado (default size=20). */
  search$(
    page = 0,
    size = 20,
    opts: MyDSpaceSearchOpts = {},
  ): Observable<Paginated<MyDSpaceObject>> {
    let params = new HttpParams()
      .set('configuration', 'workspace')
      .set('embed', 'thumbnail')
      .set('page', String(page))
      .set('size', String(size));

    if (opts.query && opts.query.trim()) {
      params = params.set('query', opts.query.trim());
    }

    if (opts.dateFrom != null || opts.dateTo != null) {
      // Rango Solr; `*` significa abierto del lado correspondiente.
      const from = opts.dateFrom ?? '*';
      const to = opts.dateTo ?? '*';
      params = params.set('f.dateIssued', `[${from} TO ${to}],equals`);
    }

    if (opts.sort) {
      params = params.set('sort', opts.sort);
    }

    return this.http
      .get<MyDSpaceSearchResponse>(`${DSPACE_API_BASE}/discover/search/objects`, { params })
      .pipe(
        map((response) => {
          const sr = response._embedded.searchResult;
          const raw = sr._embedded?.objects ?? [];
          /**
           * Aplana `_embedded.indexableObject` a `indexableObject` directo y
           * sube su `_embedded.thumbnail` al campo `thumbnail` del Item para
           * que el template arme la URL con `/bitstreams/{uuid}/content` sin
           * conocer la envoltura HAL.
           */
          const items: MyDSpaceObject[] = raw.map((o) => {
            const ix = o._embedded.indexableObject;
            const thumbnail = ix._embedded?.thumbnail;
            return {
              type: o.type,
              indexableObject: thumbnail ? { ...ix, thumbnail } : ix,
            };
          });
          return {
            items,
            totalElements: sr.page.totalElements,
            totalPages: sr.page.totalPages,
            size: sr.page.size,
            page: sr.page.number,
          };
        }),
      );
  }
}
