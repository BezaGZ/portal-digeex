import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { StatsListService } from './stats-list.service';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { Item } from '../../../core/api/models/item.model';
import { SearchResult } from '../../../core/api/models/discovery.model';

/**
 * Tests de `StatsListService`.
 *
 * Servicio del listado público de Estadística. Busca items archivados de la
 * colección `digeex-estadistica` vía Discovery (Solr) con scope en la
 * colección y los mapea a `StatsItem` sin descargar bitstreams: el Excel
 * solo se carga al entrar al detalle (CA-07).
 *
 * Ciclo 10 TDD — Sprint 7.
 */

function buildItem(uuid: string, overrides: Partial<Record<string, string>> = {}): Item {
  return {
    uuid,
    name: overrides['dc.title'] ?? 'Item',
    handle: null,
    metadata: {
      'dc.title': [{ value: overrides['dc.title'] ?? 'Docentes 2026', language: null, authority: null, confidence: -1, place: 0 }],
      'dc.description.abstract': [{ value: overrides['dc.description.abstract'] ?? 'Personal técnico docente', language: null, authority: null, confidence: -1, place: 0 }],
      'dc.date.issued': [{ value: overrides['dc.date.issued'] ?? '2026-05-21', language: null, authority: null, confidence: -1, place: 0 }],
      'digeex.statsDataset': [{ value: overrides['digeex.statsDataset'] ?? 'docentes', language: null, authority: null, confidence: -1, place: 0 }],
    },
    inArchive: true,
    discoverable: true,
    withdrawn: false,
    lastModified: '2026-05-22T18:07:00.620147Z',
    type: 'item',
  } as unknown as Item;
}

function buildSearchResult(items: Item[], total = items.length): SearchResult {
  return {
    items,
    totalElements: total,
    totalPages: 1,
    page: 0,
    size: 12,
    facets: [],
  } as SearchResult;
}

describe('StatsListService', () => {
  let service: StatsListService;
  let findByFormatFn: ReturnType<typeof vi.fn>;
  let searchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findByFormatFn = vi.fn();
    searchFn = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: CollectionCacheService, useValue: { findByFormat: findByFormatFn } },
        { provide: DiscoveryService, useValue: { search: searchFn } },
      ],
    });
    service = TestBed.inject(StatsListService);
  });

  /** Resuelve la colección por entity type y consulta Discovery con scope. */
  it('should resolve the Estadistica collection and call Discovery scoped to it', () => {
    findByFormatFn.mockReturnValue(of('collection-uuid'));
    searchFn.mockReturnValue(of(buildSearchResult([buildItem('item-1')])));

    service.searchStats(0, 12).subscribe();

    expect(findByFormatFn).toHaveBeenCalledWith('Estadistica');
    expect(searchFn).toHaveBeenCalledWith({
      scope: 'collection-uuid',
      page: 0,
      size: 12,
    });
  });

  /** Mapea cada Item al StatsItem ligero del listado (sin bitstreams). */
  it('should map each DSpace item to a StatsItem with title, abstract, dataset and issued', () => {
    findByFormatFn.mockReturnValue(of('collection-uuid'));
    searchFn.mockReturnValue(of(buildSearchResult([buildItem('item-1')])));

    let received: { uuid: string; title: string; dataset: string; issued: string } | undefined;
    service.searchStats(0, 12).subscribe((page) => {
      received = page.items[0];
    });

    expect(received).toEqual({
      uuid: 'item-1',
      title: 'Docentes 2026',
      abstract: 'Personal técnico docente',
      dataset: 'docentes',
      issued: '2026-05-21',
    });
  });

  /** Propaga la paginación (page, size, totalElements, totalPages) del backend. */
  it('should propagate pagination info from Discovery', () => {
    findByFormatFn.mockReturnValue(of('collection-uuid'));
    searchFn.mockReturnValue(
      of({
        items: [buildItem('a'), buildItem('b')],
        totalElements: 25,
        totalPages: 3,
        page: 1,
        size: 12,
        facets: [],
      } as SearchResult),
    );

    let result: { totalElements: number; totalPages: number; page: number } | undefined;
    service.searchStats(1, 12).subscribe((p) => (result = p));

    expect(result?.totalElements).toBe(25);
    expect(result?.totalPages).toBe(3);
    expect(result?.page).toBe(1);
  });

  /** Si la colección Estadistica no existe (entorno limpio), retorna página vacía. */
  it('should degrade to an empty page when the Estadistica collection is missing', () => {
    findByFormatFn.mockReturnValue(throwError(() => new Error('Collection not found')));

    let result: { items: readonly unknown[]; totalElements: number } | undefined;
    service.searchStats(0, 12).subscribe((p) => (result = p));

    expect(result?.items).toEqual([]);
    expect(result?.totalElements).toBe(0);
  });
});
