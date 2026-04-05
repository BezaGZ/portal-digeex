import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SearchResponse } from './models/search.model';
import { SearchParams, SearchResult } from './models/discovery.model';

@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly apiUrl = '/server/api';

  constructor(private readonly http: HttpClient) {}

  search(params: SearchParams = {}): Observable<SearchResult> {
    let httpParams = new HttpParams()
      .set('page', params.page ?? 0)
      .set('size', params.size ?? 20);

    if (params.query) {
      httpParams = httpParams.set('query', params.query);
    }

    if (params.scope) {
      httpParams = httpParams.set('scope', params.scope);
    }

    if (params.sort) {
      httpParams = httpParams.set('sort', params.sort);
    }

    if (params.filters) {
      for (const filter of params.filters) {
        httpParams = httpParams.set(`f.${filter.name}`, `${filter.value},${filter.operator}`);
      }
    }

    return this.http.get<SearchResponse>(
      `${this.apiUrl}/discover/search/objects`,
      { params: httpParams }
    ).pipe(
      map((response) => {
        const objects = response._embedded?.searchResult?._embedded?.objects || [];
        const items = objects
          .filter((obj) => obj._embedded?.indexableObject?.type === 'item')
          .map((obj) => obj._embedded.indexableObject);

        const page = response._embedded?.searchResult?.page;

        return {
          items,
          totalElements: page?.totalElements ?? 0,
          totalPages: page?.totalPages ?? 0,
          page: page?.number ?? 0,
          size: page?.size ?? 20,
        };
      })
    );
  }
}
