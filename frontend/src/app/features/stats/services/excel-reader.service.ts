import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import * as XLSX from 'xlsx';

import { ParsedExcel, ParsedSheet } from '../models/parsed-excel.model';
import { DSPACE_API_BASE, BITSTREAMS_PATH } from '../../../core/api/dspace-rest.util';

/**
 * Descarga el bitstream del Excel desde DSpace y lo parsea en memoria.
 * Cache `shareReplay(1)` por `(itemUuid, bitstreamUuid)`: múltiples renderers
 * en la misma página reusan una sola descarga + parseo. Cuando el bitstream
 * del item cambia (uuid distinto post-update), la nueva key invalida
 * automáticamente la entrada vieja del mapa.
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
        map((buffer) => this.parse(buffer)),
        shareReplay(1),
      );

    this.cache.set(key, flow$);
    return flow$;
  }

  /**
   * Convierte el ArrayBuffer en `ParsedExcel`. SheetJS expone `sheet_to_json`
   * con dos modos: con `header: 1` devuelve array de arrays (la primera fila
   * son los headers); sin `header` devuelve array de objetos con los headers
   * como keys. Combinamos ambos: el primero para extraer headers en orden,
   * el segundo para las filas semánticas. `raw: true` preserva tipos nativos
   * (numbers como numbers, strings como strings) en lugar de pasarlos por el
   * formatter.
   */
  private parse(buffer: ArrayBuffer): ParsedExcel {
    const wb = XLSX.read(buffer, { type: 'array' });
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
}
