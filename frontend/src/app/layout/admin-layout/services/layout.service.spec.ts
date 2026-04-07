import { TestBed } from '@angular/core/testing';
import { LayoutService } from './layout.service';

/**
 * Tests para LayoutService.
 *
 * Servicio que maneja el estado responsive del layout administrativo usando signals.
 * Controla el comportamiento del sidebar en diferentes resoluciones (desktop ≥1024px, tablet 768-1023px, mobile <768px)
 * y gestiona el tema oscuro/claro de la aplicación.
 *
 * Ciclo 5 TDD — Sprint 3
 */
describe('LayoutService', () => {
  let service: LayoutService;
  let originalInnerWidth: number;

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LayoutService]
    });
    service = TestBed.inject(LayoutService);
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth
    });
  });

  /** Initialization */

  /** Verifica que el servicio se inicialice con configuración por defecto. */
  it('should initialize with default config', () => {
    const config = service.layoutConfig();

    expect(config.preset).toBe('Nora');
    expect(config.primary).toBe('indigo');
    expect(config.darkTheme).toBe(false);
    expect(config.menuMode).toBe('static');
  });

  /** Responsive Behavior */

  /** Verifica que isDesktop() retorne true cuando window.innerWidth ≥ 1024px. */
  it('should detect desktop viewport (≥1024px)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024
    });

    expect(service.isDesktop()).toBe(true);
    expect(service.isTablet()).toBe(false);
    expect(service.isMobile()).toBe(false);
  });

  /** Verifica que isTablet() retorne true cuando window.innerWidth está entre 768-1023px. */
  it('should detect tablet viewport (768-1023px)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768
    });

    expect(service.isDesktop()).toBe(false);
    expect(service.isTablet()).toBe(true);
    expect(service.isMobile()).toBe(false);
  });

  /** Verifica que isMobile() retorne true cuando window.innerWidth < 768px. */
  it('should detect mobile viewport (<768px)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375
    });

    expect(service.isDesktop()).toBe(false);
    expect(service.isTablet()).toBe(false);
    expect(service.isMobile()).toBe(true);
  });

  /** Dark Theme */

  /** Verifica que toggleDarkMode() agregue la clase 'dark' al documentElement cuando darkTheme es true. */
  it('should toggle dark mode', () => {
    expect(service.layoutConfig().darkTheme).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    service.layoutConfig.update((prev) => ({ ...prev, darkTheme: true }));
    service.toggleDarkMode();

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    service.layoutConfig.update((prev) => ({ ...prev, darkTheme: false }));
    service.toggleDarkMode();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  /** Computed Signals */

  /** Verifica que el computed signal isSidebarActive sea true cuando overlayMenuActive o staticMenuMobileActive son true. */
  it('computed: isSidebarActive should be true when menu is active', () => {
    expect(service.isSidebarActive()).toBe(false);

    service.layoutState.update((prev) => ({ ...prev, overlayMenuActive: true }));
    expect(service.isSidebarActive()).toBe(true);

    service.layoutState.update((prev) => ({ ...prev, overlayMenuActive: false, staticMenuMobileActive: true }));
    expect(service.isSidebarActive()).toBe(true);

    service.layoutState.update((prev) => ({ ...prev, staticMenuMobileActive: false }));
    expect(service.isSidebarActive()).toBe(false);
  });

  /** State Immutability */

  /** Verifica que layoutState.update() actualice el estado de forma inmutable. */
  it('signal: layoutState should update immutably', () => {
    const initialState = service.layoutState();

    service.layoutState.update((prev) => ({ ...prev, overlayMenuActive: true }));

    const updatedState = service.layoutState();

    expect(updatedState).not.toBe(initialState);

    expect(updatedState.overlayMenuActive).toBe(true);
    expect(initialState.overlayMenuActive).toBe(false);
  });
});
