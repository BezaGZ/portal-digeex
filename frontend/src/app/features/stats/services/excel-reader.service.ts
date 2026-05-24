import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Observer } from 'rxjs';
import { shareReplay, switchMap } from 'rxjs/operators';
import * as XLSX from 'xlsx';

import { ParsedExcel, ParsedSheet } from '../models/parsed-excel.model';
import { DSPACE_API_BASE, BITSTREAMS_PATH } from '../../../core/api/dspace-rest.util';

/**
 * Descarga el bitstream del Excel desde DSpace y lo parsea en memoria.
 * Cache `shareReplay(1)` por `(itemUuid, bitstreamUuid)`: múltiples renderers
 * en la misma página reusan una sola descarga + parseo.
 *
 * El parseo se hace en un Web Worker dedicado para no bloquear el main
 * thread con datasets grandes (Estudiantes pesa 14 MB / 21k filas). Si el
 * runtime no expone `Worker` (entornos SSR, jsdom de Vitest, etc.) cae a
 * un parse in-thread con las mismas flags minimalistas.
 */
@Injectable({ providedIn: 'root' })
export class ExcelReaderService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<ParsedExcel>>();

  getParsedExcel$(itemUuid: string, bitstreamUuid: string): Observable<ParsedExcel> {
    const key = `${itemUuid}::${bitstreamUuid}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const flow$ = this.http
      .get(`${DSPACE_API_BASE}${BITSTREAMS_PATH}/${bitstreamUuid}/content`, {
        responseType: 'arraybuffer',
      })
      .pipe(
        switchMap((buffer) => this.parse$(buffer)),
        shareReplay(1),
      );

    this.cache.set(key, flow$);
    return flow$;
  }

  /**
   * Resuelve el parseo del Excel: si el runtime expone `Worker`, delega al
   * worker dedicado vía `postMessage` con transferable; si no, hace el parse
   * en el thread actual con las mismas flags optimizadas.
   */
  private parse$(buffer: ArrayBuffer): Observable<ParsedExcel> {
    return new Observable<ParsedExcel>((observer) => {
      if (typeof Worker !== 'undefined') {
        return this.runInWorker(buffer, observer);
      }
      try {
        observer.next(parseBufferInline(buffer));
        observer.complete();
      } catch (err) {
        observer.error(err);
      }
      return undefined;
    });
  }

  /**
   * Crea un worker, le pasa el buffer en modo transferable (zero-copy) y
   * espera la respuesta. Termina el worker después del primer mensaje para
   * liberar el thread; el `shareReplay(1)` del flujo padre cachea el
   * resultado, así que no se vuelve a crear para el mismo `(item, bitstream)`.
   */
  private runInWorker(
    buffer: ArrayBuffer,
    observer: Observer<ParsedExcel>,
  ): () => void {
    const worker = new Worker(
      new URL('./excel-reader.worker', import.meta.url),
      { type: 'module' },
    );
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    worker.onmessage = (event) => {
      const { data, error } = event.data as {
        data: ParsedExcel | null;
        error: string | null;
      };
      if (data) {
        observer.next(data);
        observer.complete();
      } else {
        observer.error(new Error(error ?? 'Error desconocido al parsear el Excel'));
      }
      worker.terminate();
    };
    worker.onerror = (err) => {
      observer.error(err);
      worker.terminate();
    };

    worker.postMessage({ id, buffer }, [buffer]);
    return () => worker.terminate();
  }
}

/**
 * Versión in-thread del parser usada como fallback cuando `Worker` no está
 * disponible. Mismas flags que el worker para que el shape resultante sea
 * idéntico y los tests no dependan del entorno.
 */
function parseBufferInline(buffer: ArrayBuffer): ParsedExcel {
  const wb = XLSX.read(buffer, {
    type: 'array',
    dense: true,
    cellHTML: false,
    cellFormula: false,
    cellStyles: false,
    cellDates: false,
    bookFiles: false,
  });
  const sheets: Record<string, ParsedSheet> = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    });
    const headers = ((aoa[0] as unknown[]) ?? []).map((h) => String(h ?? ''));
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      raw: true,
      defval: null,
    });
    sheets[name] = { headers, rows };
  }
  return { sheetNames: wb.SheetNames, sheets };
}
