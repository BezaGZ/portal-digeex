/**
 * Shape neutral del Excel parseado que devuelve `ExcelReaderService`. Aísla
 * a los renderers del lib de parseo (SheetJS hoy, lo que sea mañana) y les
 * entrega filas como objetos por header para que accedan por nombre semántico
 * en lugar de por índice posicional (más resistente a reordenamientos de
 * columnas en el Excel fuente).
 */
export interface ParsedExcel {
  readonly sheetNames: readonly string[];
  readonly sheets: Readonly<Record<string, ParsedSheet>>;
}

export interface ParsedSheet {
  readonly headers: readonly string[];
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
}
