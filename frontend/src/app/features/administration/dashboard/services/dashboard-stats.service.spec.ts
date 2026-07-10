import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { DashboardStatsService } from './dashboard-stats.service';
import { DiscoveryService } from '../../../../core/api/discovery.service';
import { SearchResult } from '../../../../core/api/models/discovery.model';

/**
 * Tests de `DashboardStatsService`.
 *
 * Búsqueda base del dashboard compartida entre cards: total y facetas salen
 * del mismo response, así los widgets no repiten la misma petición a
 * Discovery (N+1 peticiones idénticas → 1 por scope).
 *
 * Fix operativo del dashboard — Sprint 11.
 */
describe('DashboardStatsService', () => {
  let searchFn: ReturnType<typeof vi.fn>;
  let service: DashboardStatsService;

  const RESULT = { totalElements: 11, facets: [] } as unknown as SearchResult;

  beforeEach(() => {
    searchFn = vi.fn().mockReturnValue(of(RESULT));
    TestBed.configureTestingModule({
      providers: [
        DashboardStatsService,
        { provide: DiscoveryService, useValue: { search: searchFn } },
      ],
    });
    service = TestBed.inject(DashboardStatsService);
  });

  /** Verifica que varios consumidores del mismo scope compartan una sola petición. */
  it('should fire a single search per scope regardless of the number of consumers', () => {
    service.baseSearch$('col-1').subscribe();
    service.baseSearch$('col-1').subscribe();
    service.baseSearch$('col-1').subscribe();

    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith({ size: 0, scope: 'col-1', dsoType: 'item' });
  });

  /** Verifica que scopes distintos disparen peticiones separadas (cada rol ve su recorte). */
  it('should fire a separate search per distinct scope', () => {
    service.baseSearch$('col-1').subscribe();
    service.baseSearch$(undefined).subscribe();

    expect(searchFn).toHaveBeenCalledTimes(2);
    expect(searchFn).toHaveBeenCalledWith({ size: 0, scope: undefined, dsoType: 'item' });
  });

  /** Verifica que un suscriptor tardío reciba el resultado cacheado sin nueva petición. */
  it('should replay the cached result to late subscribers', () => {
    service.baseSearch$('col-1').subscribe();

    let received: SearchResult | undefined;
    service.baseSearch$('col-1').subscribe((r) => (received = r));

    expect(received).toBe(RESULT);
    expect(searchFn).toHaveBeenCalledTimes(1);
  });
});
