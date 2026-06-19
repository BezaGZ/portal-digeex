import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Site } from './models/site.model';
import { HalListResponse } from './models/hal.model';
import { DSPACE_API_BASE, SITES_PATH } from './dspace-rest.util';

/**
 * Wrapper del recurso /api/core/sites de DSpace 9.x. Espeja el patron de
 * SiteDataService de dspace-angular: DSpace expone el Site como listado HAL
 * aunque siempre hay exactamente un Site raiz.
 */
@Injectable({ providedIn: 'root' })
export class SiteApiService {
  private readonly http = inject(HttpClient);

  /** Site raiz del repositorio (el primero del listado); null si viene vacio. */
  getSiteRoot$(): Observable<Site | null> {
    return this.http
      .get<HalListResponse<Site>>(`${DSPACE_API_BASE}${SITES_PATH}`)
      .pipe(map((r) => r._embedded?.['sites']?.[0] ?? null));
  }
}
