import { Injectable, signal } from '@angular/core';
import { ItemView } from '../../../core/api/models/view.model';
import { SearchFilters, ScopeOption } from '../models/search-filters.model';

/**
 * Persistencia del estado de la búsqueda avanzada mientras la app está viva.
 *
 * El componente AdvancedSearch se destruye cuando el usuario navega al
 * detalle de un item; al volver atrás se monta de cero. Sin este servicio,
 * el scope, los filtros y los resultados se pierden y el usuario tiene que
 * rehacer la búsqueda. El servicio sobrevive a la destrucción del componente
 * porque está providedIn root y mantiene el estado en signals leídos en
 * ngOnInit para restaurar la UI.
 *
 * Sprint 6
 */
@Injectable({ providedIn: 'root' })
export class SearchStateService {
  /** Scope (UUID de community o collection) seleccionado en el dropdown. */
  readonly scope = signal('');

  /** Tipo de scope: community (incluye sub-community) o collection. */
  readonly scopeType = signal<'community' | 'collection'>('community');

  /** Filtros aplicados en la última búsqueda. Null si no hay búsqueda activa. */
  readonly filters = signal<SearchFilters | null>(null);

  /** Página actual del paginador (0-indexed). */
  readonly currentPage = signal(0);

  /** True una vez que el usuario disparó al menos una búsqueda. */
  readonly hasSearched = signal(false);

  /** True mientras una búsqueda está en curso (controla el spinner de UI). */
  readonly isSearching = signal(false);

  /** Resultados de la última búsqueda (vista hidratada para los DocumentCards). */
  readonly results = signal<ItemView[]>([]);

  /** Total de items que matchean la búsqueda actual (para el paginador). */
  readonly totalElements = signal(0);

  /** Opciones del dropdown de scope cacheadas; evita recargarlas al volver. */
  readonly scopeOptions = signal<ScopeOption[]>([]);

  /** Devuelve el estado a su forma inicial. Útil al cerrar sesión. */
  reset(): void {
    this.scope.set('');
    this.scopeType.set('community');
    this.filters.set(null);
    this.currentPage.set(0);
    this.hasSearched.set(false);
    this.isSearching.set(false);
    this.results.set([]);
    this.totalElements.set(0);
  }
}
