/**
 * Tests del SearchStateService.
 *
 * Servicio singleton que persiste el estado de la búsqueda avanzada
 * (scope, filtros, página, resultados) mientras la app está viva.
 * Permite que al volver del detalle de un item el componente AdvancedSearch
 * restaure su estado en lugar de montarse de cero perdiendo lo que el
 * usuario había buscado.
 *
 * Sprint 6
 */
import { TestBed } from '@angular/core/testing';
import { SearchStateService } from './search-state.service';

describe('SearchStateService', () => {
  let service: SearchStateService;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SearchStateService);
  });

  /** Estado inicial */

  describe('estado inicial', () => {
    /** Verifica que arranca con scope vacío y sin búsqueda hecha;
     *  el componente lee estos signals al montar y decide si restaurar o no. */
    it('should start with empty scope and hasSearched=false', () => {
      expect(service.scope()).toBe('');
      expect(service.hasSearched()).toBe(false);
    });
  });

  /** reset() */

  describe('reset()', () => {
    /** Verifica que reset() limpia el estado completo después de una búsqueda
     *  activa. Útil para casos como logout donde queremos que el siguiente
     *  login arranque la búsqueda en estado limpio. */
    it('should restore all signals to initial state after mutation', () => {
      service.scope.set('uuid-test');
      service.hasSearched.set(true);
      service.currentPage.set(3);
      service.totalElements.set(42);

      service.reset();

      expect(service.scope()).toBe('');
      expect(service.hasSearched()).toBe(false);
      expect(service.currentPage()).toBe(0);
      expect(service.totalElements()).toBe(0);
    });
  });
});
