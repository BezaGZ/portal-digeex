import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { SearchFiltersComponent } from './search-filters';
import { VocabularyDisplayService } from '../../../../core/api/vocabulary-display.service';
import { Facet } from '../../../../core/api/models/discovery.model';

/**
 * Tests de `SearchFiltersComponent`.
 *
 * Las facetas de DSpace para language, itemtype y audience llegan con el
 * código stored crudo (acr, quc, Manual). El componente debe traducirlas al
 * display label del vocabulario controlado correspondiente (idiomas-digeex,
 * tipos-documento, niveles-educativos) usando VocabularyDisplayService.
 *
 * Ciclo 22 TDD — Sprint 6.
 */
describe('SearchFiltersComponent', () => {
  let vocabDisplay: VocabularyDisplayService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchFiltersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations()],
    }).compileComponents();

    vocabDisplay = TestBed.inject(VocabularyDisplayService);

    // Mock displayMap$: los códigos del filtro se traducen contra estos pares.
    vi.spyOn(vocabDisplay, 'displayMap$').mockImplementation((name: string) => {
      if (name === 'idiomas-digeex') {
        return of(
          new Map<string, string>([
            ['acr', 'Achi'],
            ['quc', "K'iche'"],
            ['es', 'Español'],
          ]),
        );
      }
      if (name === 'tipos-documento') {
        return of(new Map<string, string>([['Manual', 'Manual']]));
      }
      if (name === 'niveles-educativos') {
        return of(new Map<string, string>([['Primaria', 'Primaria']]));
      }
      return of(new Map());
    });
  });

  /** Verifica que los códigos de la faceta language se traduzcan al display label vía VocabularyDisplayService. */
  it('should translate language facet codes to display labels using VocabularyDisplayService', () => {
    const fixture = TestBed.createComponent(SearchFiltersComponent);
    fixture.detectChanges();

    const facets: Facet[] = [
      {
        name: 'language',
        values: [
          { label: 'acr', count: 2 },
          { label: 'quc', count: 1 },
          { label: 'es', count: 5 },
        ],
      },
    ];

    fixture.componentInstance.updateFacetOptions(facets);

    const opts = fixture.componentInstance.idiomaOptions();
    // value se preserva (es el código que DSpace espera de vuelta como filtro);
    // label se traduce al display del vocabulario.
    expect(opts.find((o) => o.value === 'acr')?.label).toBe('Achi (2)');
    expect(opts.find((o) => o.value === 'quc')?.label).toBe("K'iche' (1)");
    expect(opts.find((o) => o.value === 'es')?.label).toBe('Español (5)');
  });
});
