import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';

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
 * Ciclo 22 TDD — Sprint 6. Ajustado en Ciclos 10, 11 (Sprint 9) y Ciclo 36 (Sprint 10).
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

  /**
   * Verifica que los vocabularios NO se carguen al construir el componente.
   * La traducción es on-demand al llegar las facetas (al elegir scope), no al
   * entrar a la pantalla; el cache de VocabularyDisplayService evita repetir.
   */
  it('should not load vocabularies on construction (lazy until facets arrive)', () => {
    const fixture = TestBed.createComponent(SearchFiltersComponent);
    fixture.detectChanges();

    expect(vocabDisplay.displayMap$).not.toHaveBeenCalled();
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

  /**
   * Verifica que itemtype y audience NO pidan vocabulario: esas facetas ya
   * llegan con texto legible, así que se usan tal cual. Solo idioma (código ISO)
   * se traduce. Evita dos peticiones de vocabulario no-op al elegir scope.
   */
  it('should not fetch vocabularies for itemtype and audience (already readable)', () => {
    const fixture = TestBed.createComponent(SearchFiltersComponent);
    fixture.detectChanges();

    const facets: Facet[] = [
      { name: 'itemtype', values: [{ label: 'Acuerdo', count: 3 }] },
      { name: 'audience', values: [{ label: 'Todos', count: 7 }] },
    ];

    fixture.componentInstance.updateFacetOptions(facets);

    expect(vocabDisplay.displayMap$).not.toHaveBeenCalled();
    expect(fixture.componentInstance.tipoDocumentoOptions()[0]).toEqual({ label: 'Acuerdo (3)', value: 'Acuerdo' });
    expect(fixture.componentInstance.nivelEducativoOptions()[0]).toEqual({ label: 'Todos (7)', value: 'Todos' });
  });

  /**
   * Verifica que si falla la carga del vocabulario de idioma, los filtros se
   * habiliten igual con la etiqueta cruda, en vez de quedar deshabilitados.
   */
  it('should enable the filters even if the language vocabulary fails to load', () => {
    vi.spyOn(vocabDisplay, 'displayMap$').mockReturnValue(throwError(() => new Error('boom')));

    const fixture = TestBed.createComponent(SearchFiltersComponent);
    fixture.detectChanges();

    fixture.componentInstance.updateFacetOptions([
      { name: 'language', values: [{ label: 'es', count: 5 }] },
    ]);

    expect(fixture.componentInstance.facetsLoaded()).toBe(true);
    expect(fixture.componentInstance.idiomaOptions()[0]).toEqual({ label: 'es (5)', value: 'es' });
  });

  /** Verifica que con scope elegido y facetas sin cargar, el panel renderice skeletons de filtro. */
  it('should render filter skeletons while facets are loading', () => {
    const fixture = TestBed.createComponent(SearchFiltersComponent);
    fixture.componentInstance.filters.scope = 'col-1';
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="filters-skeleton"]'),
    ).not.toBeNull();
  });

  /** Verifica que con scopeLoading en true, el dropdown de scope renderice un skeleton. */
  it('should render the scope skeleton while scope options are loading', () => {
    const fixture = TestBed.createComponent(SearchFiltersComponent);
    fixture.componentRef.setInput('scopeLoading', true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="scope-skeleton"]'),
    ).not.toBeNull();
  });
});
