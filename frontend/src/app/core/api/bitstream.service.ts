import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { Bitstream } from './models/bitstream.model';
import { BundlesResponse, Bundle } from './models/search.model';
import { HalListResponse } from './models/hal.model';

@Injectable({ providedIn: 'root' })
export class BitstreamService {
  private readonly apiUrl = '/server/api';
  private bundlesCache = new Map<string, Bundle[]>();

  constructor(private readonly http: HttpClient) {}

  getBitstreamsForItem(itemUuid: string): Observable<Bitstream[]> {
    return this.getBundlesForItem(itemUuid).pipe(
      switchMap((bundles) => {
        const originalBundle = bundles.find((b) => b.name === 'ORIGINAL');

        if (!originalBundle) {
          return of([] as Bitstream[]);
        }

        return this.fetchBitstreams(originalBundle.uuid);
      })
    );
  }

  getDownloadUrl(bitstreamUuid: string): string {
    return `${this.apiUrl}/core/bitstreams/${bitstreamUuid}/content`;
  }

  private getBundlesForItem(itemUuid: string): Observable<Bundle[]> {
    const cached = this.bundlesCache.get(itemUuid);
    if (cached) {
      return of(cached);
    }

    const params = new HttpParams().set('page', 0).set('size', 20);

    return this.http.get<BundlesResponse>(
      `${this.apiUrl}/core/items/${itemUuid}/bundles`,
      { params }
    ).pipe(
      map((res) => res._embedded?.bundles || []),
      tap((bundles) => this.bundlesCache.set(itemUuid, bundles))
    );
  }

  private fetchBitstreams(bundleUuid: string): Observable<Bitstream[]> {
    const params = new HttpParams().set('page', 0).set('size', 20);

    return this.http.get<HalListResponse<Bitstream>>(
      `${this.apiUrl}/core/bundles/${bundleUuid}/bitstreams`,
      { params }
    ).pipe(
      map((res) => res._embedded?.['bitstreams'] || [])
    );
  }
}
