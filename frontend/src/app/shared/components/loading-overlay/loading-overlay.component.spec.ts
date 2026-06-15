import { TestBed } from '@angular/core/testing';
import { LoadingService } from '../../../core/loading/loading.service';
import { LoadingOverlayComponent } from './loading-overlay.component';

/**
 * Tests de `LoadingOverlayComponent`.
 *
 * Host único del indicador de carga: muestra el overlay cuando hay una
 * operación en vuelo y alterna barra determinada/indeterminada según el modo
 * del `LoadingService`.
 *
 * Ciclo 46 TDD — Sprint 8.
 */
describe('LoadingOverlayComponent', () => {
  let loading: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LoadingOverlayComponent] });
    loading = TestBed.inject(LoadingService);
  });

  /** Verifica que el overlay aparezca solo cuando hay una carga activa. */
  it('should show the overlay when loading is active', () => {
    const fixture = TestBed.createComponent(LoadingOverlayComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="loading-overlay"]')).toBeNull();

    loading.begin({ message: 'Cargando…' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="loading-overlay"]')).not.toBeNull();
  });

  /** Verifica que muestre la barra determinada cuando el modo es determinado. */
  it('should render the determinate bar when the mode is determinate', () => {
    const fixture = TestBed.createComponent(LoadingOverlayComponent);
    const id = loading.begin({ message: 'Subiendo…' });
    loading.report(id, { current: 2, total: 4 });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="loading-determinate"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="loading-indeterminate"]')).toBeNull();
  });
});
