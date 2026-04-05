import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AdvancedSearch } from './advanced-search';
import { DiscoveryService } from '../../core/api/discovery.service';

/**
 * Tests para AdvancedSearchComponent.
 *
 * Página de búsqueda avanzada con barra de búsqueda,
 * filtros dropdown y resultados paginados.
 *
 * Ciclo 3 TDD — Sprint 4 (RED).
 */
describe('AdvancedSearch', () => {
  let component: AdvancedSearch;
  let discoveryService: DiscoveryService;

  const mockSearchResult = {
    items: [
      {
        uuid: 'item-001',
        name: 'Manual de Educación',
        handle: '',
        metadata: {
          'dc.title': [{ value: 'Manual de Educación' }],
          'dc.type': [{ value: 'Manual' }],
        },
        inArchive: true,
        discoverable: true,
        withdrawn: false,
        lastModified: '',
        type: 'item',
      },
    ],
    totalElements: 1,
    totalPages: 1,
    page: 0,
    size: 20,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdvancedSearch],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdvancedSearch);
    component = fixture.componentInstance;
    discoveryService = TestBed.inject(DiscoveryService);
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should render search bar and filter dropdowns', () => {
    expect(component.filters).toBeDefined();
    expect(component.filters.query).toBe('');
    expect(component.comunidadesOptions.length).toBeGreaterThan(0);
    expect(component.tipoDocumentoOptions.length).toBeGreaterThan(0);
    expect(component.orderByOptions.length).toBeGreaterThan(0);
  });

  it('should call DiscoveryService on search', () => {
    const searchSpy = vi.spyOn(discoveryService, 'search').mockReturnValue(of(mockSearchResult));

    component.filters.query = 'educación';
    component.onSearch();

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'educación' })
    );
  });
});
