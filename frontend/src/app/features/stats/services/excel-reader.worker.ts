/// <reference lib="webworker" />

import * as XLSX from 'xlsx';

import { ParsedExcel, ParsedSheet } from '../models/parsed-excel.model';

/**
 * Mensaje del main thread al worker. El `id` permite correlacionar la
 * respuesta cuando el worker procesa varias requests en paralelo (no es el
 * caso hoy pero deja la puerta abierta sin romper el contrato).
 */
interface ExcelReaderWorkerRequest {
  readonly id: string;
  readonly buffer: ArrayBuffer;
}

/** Respuesta del worker al main thread. `error` es no-null cuando algo falló. */
interface ExcelReaderWorkerResponse {
  readonly id: string;
  readonly data: ParsedExcel | null;
  readonly error: string | null;
}

/**
 * Worker dedicado para parsear el ArrayBuffer del Excel con SheetJS fuera
 * del main thread. Aplica flags minimalistas (`dense`, sin HTML/fórmulas/
 * estilos/fechas) para reducir trabajo y memoria; con 14 MB / 21k filas
 * el main thread deja de bloquearse y el spinner del UI sigue animado.
 *
 * El buffer se recibe vía transferable, así que el main thread cede su
 * propiedad y no hay duplicación de los 14 MB en memoria.
 */
addEventListener('message', (event: MessageEvent<ExcelReaderWorkerRequest>) => {
  const { id, buffer } = event.data;
  try {
    const parsed = parseBuffer(buffer);
    const response: ExcelReaderWorkerResponse = { id, data: parsed, error: null };
    postMessage(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al parsear el Excel';
    const response: ExcelReaderWorkerResponse = { id, data: null, error: message };
    postMessage(response);
  }
});

function parseBuffer(buffer: ArrayBuffer): ParsedExcel {
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
