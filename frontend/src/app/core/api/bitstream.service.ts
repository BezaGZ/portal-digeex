import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { Bitstream } from './models/bitstream.model';
import { BundlesResponse, Bundle } from './models/search.model';
import { HalListResponse } from './models/hal.model';

/**
 * Servicio para obtener bitstreams (archivos) de un ítem en DSpace.
 * Cachea los bundles por ítem para no repetir la primera petición
 * cuando se necesitan tanto el thumbnail como el archivo original.
 */
@Injectable({ providedIn: 'root' })
export class BitstreamService {
  private readonly apiUrl = '/server/api';
  private bundlesCache = new Map<string, Bundle[]>();

  constructor(private readonly http: HttpClient) {}

  /**
   * Obtiene los bitstreams del bundle ORIGINAL de un ítem.
   * Primero consulta los bundles (con caché), luego pide los bitstreams.
   * @param itemUuid - UUID del ítem
   * @returns Observable con arreglo de bitstreams del bundle ORIGINAL
   */
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

  /**
   * Construye la URL de descarga directa de un bitstream.
   * @param bitstreamUuid - UUID del bitstream
   * @returns URL completa para descargar el archivo
   */
  getDownloadUrl(bitstreamUuid: string): string {
    return `${this.apiUrl}/core/bitstreams/${bitstreamUuid}/content`;
  }

  /**
   * Obtiene los bundles de un ítem, usando caché en memoria.
   * Si ya se pidieron antes para este ítem, devuelve el resultado sin HTTP.
   * @param itemUuid - UUID del ítem
   * @returns Observable con arreglo de bundles (ORIGINAL, THUMBNAIL, LICENSE, etc.)
   */
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

  /**
   * Pide los bitstreams de un bundle específico al backend.
   * @param bundleUuid - UUID del bundle
   * @returns Observable con arreglo de bitstreams
   */
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
