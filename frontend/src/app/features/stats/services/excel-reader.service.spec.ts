import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import * as XLSX from 'xlsx';

import { ExcelReaderService } from './excel-reader.service';
import { ParsedExcel } from '../models/parsed-excel.model';

/**
 * Tests de `ExcelReaderService`.
 *
 * Servicio que descarga el bitstream del Excel desde el endpoint estándar de
 * DSpace (`/server/api/core/bitstreams/<uuid>/content`) con `responseType:
 * 'arraybuffer'` y lo parsea con SheetJS a un `ParsedExcel` de shape neutral
 * (filas como objetos por header). Cache `shareReplay(1)` por
 * `(itemUuid, bitstreamUuid)`: dos consumidores con la misma key comparten
 * una sola descarga + parseo; un cambio en cualquiera de las dos partes de
 * la key dispara una nueva request.
 *
 * Ciclo 7 TDD — Sprint 7.
 */
describe('ExcelReaderService', () => {
  let service: ExcelReaderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExcelReaderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /**
   * Genera un .xlsx mínimo en memoria con SheetJS para que los tests parseen
   * un binario real sin depender de un fixture externo. Una sola hoja `Hoja1`
   * con headers y dos filas representativas.
   */
  function makeXlsxBuffer(): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Departamento', 'Total'],
      ['Guatemala', 1234],
      ['Quetzaltenango', 567],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  }

  /** Descarga el contenido del bitstream como ArrayBuffer desde el endpoint estándar. */
  it('should request the bitstream content as ArrayBuffer from the bitstreams endpoint', () => {
    service.getParsedExcel$('item-1', 'bs-1').subscribe();

    const req = httpMock.expectOne('/server/api/core/bitstreams/bs-1/content');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('arraybuffer');
    req.flush(new ArrayBuffer(0));
  });

  /** Parsea el ArrayBuffer a ParsedExcel con headers y filas como objetos por header. */
  it('should parse the ArrayBuffer into a ParsedExcel with headers and object-shaped rows', () => {
    let result: ParsedExcel | undefined;
    service.getParsedExcel$('item-1', 'bs-1').subscribe((r) => (result = r));

    httpMock.expectOne('/server/api/core/bitstreams/bs-1/content').flush(makeXlsxBuffer());

    expect(result).toBeDefined();
    expect(result!.sheetNames).toEqual(['Hoja1']);
    expect(result!.sheets['Hoja1'].headers).toEqual(['Departamento', 'Total']);
    expect(result!.sheets['Hoja1'].rows).toEqual([
      { Departamento: 'Guatemala', Total: 1234 },
      { Departamento: 'Quetzaltenango', Total: 567 },
    ]);
  });

  /** Cache hit: dos subscribes a la misma (itemUuid, bitstreamUuid) reusan una sola HTTP request. */
  it('should reuse the same observable for identical (itemUuid, bitstreamUuid)', () => {
    let r1: ParsedExcel | undefined;
    let r2: ParsedExcel | undefined;

    service.getParsedExcel$('item-1', 'bs-1').subscribe((r) => (r1 = r));
    service.getParsedExcel$('item-1', 'bs-1').subscribe((r) => (r2 = r));

    httpMock.expectOne('/server/api/core/bitstreams/bs-1/content').flush(makeXlsxBuffer());

    expect(r1).toBe(r2);
  });

  /** Cache miss: keys completamente distintas hacen dos requests separados. */
  it('should issue separate requests for fully different (itemUuid, bitstreamUuid) keys', () => {
    service.getParsedExcel$('item-1', 'bs-1').subscribe();
    service.getParsedExcel$('item-2', 'bs-2').subscribe();

    const req1 = httpMock.expectOne('/server/api/core/bitstreams/bs-1/content');
    const req2 = httpMock.expectOne('/server/api/core/bitstreams/bs-2/content');
    req1.flush(makeXlsxBuffer());
    req2.flush(makeXlsxBuffer());
  });

  /** La key del cache incluye también el bitstreamUuid: cambio post-update dispara nueva request. */
  it('should issue a new request when only the bitstreamUuid changes for the same item', () => {
    service.getParsedExcel$('item-1', 'bs-1').subscribe();
    service.getParsedExcel$('item-1', 'bs-2').subscribe();

    const req1 = httpMock.expectOne('/server/api/core/bitstreams/bs-1/content');
    const req2 = httpMock.expectOne('/server/api/core/bitstreams/bs-2/content');
    req1.flush(makeXlsxBuffer());
    req2.flush(makeXlsxBuffer());
  });
});
