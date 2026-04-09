import { Injectable, effect, signal, computed } from '@angular/core';;
import { Subject } from 'rxjs';

export interface layoutConfig {
    preset?: string;
    primary?: string;
    surface?: string | undefined | null;
    darkTheme?: boolean;
    menuMode?: string;
}

interface LayoutState {
    staticMenuDesktopInactive?: boolean;
    overlayMenuActive?: boolean;
    configSidebarVisible?: boolean;
    staticMenuMobileActive?: boolean;
    menuHoverActive?: boolean;
}

interface MenuChangeEvent {
    key: string;
    routeEvent?: boolean;
}

/**
 * Servicio del layout administrativo (PrimeNG Sakai).
 * Maneja el estado del menú lateral, dark mode y configuración visual.
 * Usa signals para estado reactivo y Subjects para eventos de menú.
 */
@Injectable({
    providedIn: 'root'
})
export class LayoutService {
    _config: layoutConfig = {
        preset: 'Nora',
        primary: 'indigo',
        surface: null,
        darkTheme: false,
        menuMode: 'static'
    };

    _state: LayoutState = {
        staticMenuDesktopInactive: false,
        overlayMenuActive: false,
        configSidebarVisible: false,
        staticMenuMobileActive: false,
        menuHoverActive: false
    };

    layoutConfig = signal<layoutConfig>(this._config);

    layoutState = signal<LayoutState>(this._state);

    private configUpdate = new Subject<layoutConfig>();

    private overlayOpen = new Subject<void>();

    private menuSource = new Subject<MenuChangeEvent>();

    private resetSource = new Subject();

    menuSource$ = this.menuSource.asObservable();

    resetSource$ = this.resetSource.asObservable();

    configUpdate$ = this.configUpdate.asObservable();

    overlayOpen$ = this.overlayOpen.asObservable();

    theme = computed(() => (this.layoutConfig()?.darkTheme ? 'light' : 'dark'));

    isSidebarActive = computed(() => this.layoutState().overlayMenuActive || this.layoutState().staticMenuMobileActive);

    isDarkTheme = computed(() => this.layoutConfig().darkTheme);

    getPrimary = computed(() => this.layoutConfig().primary);

    getSurface = computed(() => this.layoutConfig().surface);

    isOverlay = computed(() => this.layoutConfig().menuMode === 'overlay');

    transitionComplete = signal<boolean>(false);

    private initialized = false;

    private closeMenusSource = new Subject<void>();
    closeAllMenus$ = this.closeMenusSource.asObservable();

    /**
     * Emite evento para cerrar todos los menús abiertos.
     */
    closeAllMenus() {
        this.closeMenusSource.next();
    }

    constructor() {
        effect(() => {
            const config = this.layoutConfig();
            if (config) {
                this.onConfigUpdate();
            }
        });

        effect(() => {
            const config = this.layoutConfig();

            if (!this.initialized || !config) {
                this.initialized = true;
                return;
            }

            this.handleDarkModeTransition(config);
        });
    }

    /**
     * Inicia la transición de dark mode usando View Transitions API si está disponible.
     * @param config - Configuración actual del layout
     */
    private handleDarkModeTransition(config: layoutConfig): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((document as any).startViewTransition) {
            this.startViewTransition(config);
        } else {
            this.toggleDarkMode(config);
            this.onTransitionEnd();
        }
    }

    /**
     * Usa la View Transitions API del browser para animar el cambio de tema.
     * @param config - Configuración con el estado de darkTheme
     */
    private startViewTransition(config: layoutConfig): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transition = (document as any).startViewTransition(() => {
            this.toggleDarkMode(config);
        });

        transition.ready
            .then(() => {
                this.onTransitionEnd();
            })
            .catch(() => {});
    }

    /**
     * Agrega o remueve la clase 'dark' del documento según la configuración.
     * @param config - Configuración del layout (si no se pasa, usa la actual)
     */
    toggleDarkMode(config?: layoutConfig): void {
        const _config = config || this.layoutConfig();
        if (_config.darkTheme) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    /**
     * Marca la transición como completada y la resetea inmediatamente.
     */
    private onTransitionEnd() {
        this.transitionComplete.set(true);
        setTimeout(() => {
            this.transitionComplete.set(false);
        });
    }

    /**
     * Alterna la visibilidad del menú lateral según el modo (overlay vs static)
     * y el tamaño de pantalla (desktop vs mobile).
     */
    onMenuToggle() {
        if (this.isOverlay()) {
            this.layoutState.update((prev) => ({ ...prev, overlayMenuActive: !this.layoutState().overlayMenuActive }));

            if (this.layoutState().overlayMenuActive) {
                this.overlayOpen.next();
            }
        }

        if (this.isDesktop()) {
            this.layoutState.update((prev) => ({ ...prev, staticMenuDesktopInactive: !this.layoutState().staticMenuDesktopInactive }));
        } else {
            this.layoutState.update((prev) => ({ ...prev, staticMenuMobileActive: !this.layoutState().staticMenuMobileActive }));

            if (this.layoutState().staticMenuMobileActive) {
                this.overlayOpen.next();
            }
        }
    }

    /**
     * @returns true si el viewport es >= 1024px
     */
    isDesktop() {
        return window.innerWidth >= 1024;
    }

    /**
     * @returns true si el viewport está entre 768px y 1023px
     */
    isTablet() {
        return window.innerWidth >= 768 && window.innerWidth < 1024;
    }

    /**
     * @returns true si el viewport es < 768px
     */
    isMobile() {
        return window.innerWidth < 768;
    }

    /**
     * Emite la configuración actual a los suscriptores de configUpdate$.
     */
    onConfigUpdate() {
        this._config = { ...this.layoutConfig() };
        this.configUpdate.next(this.layoutConfig());
    }

    /**
     * Notifica un cambio de estado en el menú lateral.
     * @param event - Evento con la key del menú y si fue por navegación
     */
    onMenuStateChange(event: MenuChangeEvent) {
        this.menuSource.next(event);
    }

    /**
     * Emite un evento de reset para restaurar el estado del menú.
     */
    reset() {
        this.resetSource.next(true);
    }
}
