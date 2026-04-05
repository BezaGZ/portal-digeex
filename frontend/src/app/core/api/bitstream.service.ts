import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Bitstream } from './models/bitstream.model';
import { BundlesResponse, Bundle } from './models/search.model';
import { HalListResponse } from './models/hal.model';

@Injectable({ providedIn: 'root' })
export class BitstreamService {
  private readonly apiUrl = '/server/api';

  constructor(private readonly http: HttpClient) {}

  getBitstreamsForItem(itemUuid: string): Observable<Bitstream[]> {
    const params = new HttpParams().set('page', 0).set('size', 20);

    return this.http.get<BundlesResponse>(
      `${this.apiUrl}/core/items/${itemUuid}/bundles`,
      { params }
    ).pipe(
      switchMap((bundlesResponse) => {
        const bundles = bundlesResponse._embedded?.bundles || [];
        const originalBundle = bundles.find((b: Bundle) => b.name === 'ORIGINAL');

        if (!originalBundle) {
          return of([] as Bitstream[]);
        }

        return this.http.get<HalListResponse<Bitstream>>(
          `${this.apiUrl}/core/bundles/${originalBundle.uuid}/bitstreams`,
          { params }
        ).pipe(
          map((res) => res._embedded?.['bitstreams'] || [])
        );
      })
    );
  }

  getDownloadUrl(bitstreamUuid: string): string {
    return `${this.apiUrl}/core/bitstreams/${bitstreamUuid}/content`;
  }
}
