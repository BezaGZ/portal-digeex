import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { firstValueFrom } from 'rxjs';
import { Chart } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

/**
 * Registra `chartjs-plugin-datalabels` globalmente para que los chart
 * components de Stats puedan mostrar el valor de cada slice/barra siempre
 * (no solo al hover). Cada componente decide en sus options si activarlo y
 * con qué formato.
 */
Chart.register(ChartDataLabels);

import { registerLocaleData } from '@angular/common';
import localeEsGT from '@angular/common/locales/es-GT';

registerLocaleData(localeEsGT);

import { routes } from './app.routes';
import { csrfInterceptor } from './core/csrf/csrf.interceptor';
import { jwtInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/error/error.interceptor';
import { AuthService } from './core/auth/auth.service';





/**
 * Preset personalizado de PrimeNG para Portal DIGEEX.
 *
 * Implementa la paleta oficial del Gobierno de Guatemala según
 * la Estrategia Visual 2026. Configura colores primarios, superficies
 * y esquemas de color para todos los componentes de PrimeNG.
 *
 * @see {@link https://primeng.org/theming#customization PrimeNG Theming}
 * @see {@link https://www.primeuix.org/themes Themes Documentation}
 */
const DigeexPreset = definePreset(Aura, {
  semantic: {
    /**
     * Escala de tonos del color primario institucional.
     * Base: #1E3159 (Azul Gobierno).
     *
     * Esta escala se genera desde el color oficial y se usa
     * automáticamente en todos los componentes PrimeNG para
     * estados hover, focus, active y disabled.
     */
    primary: {
      50: '#E8EDF5',
      100: '#C4D0E5',
      200: '#9DB1D4',
      300: '#7691C3',
      400: '#5879B6',      /** Base: Azul Gobierno oficial */
      500: '#1E3159',
      600: '#1A2B4E',
      700: '#162443',
      800: '#121D38',
      900: '#0C1327',
      950: '#080D1A'
    },

    colorScheme: {
      light: {
        /**
         * Configuración de colores primarios para modo claro.
         * hoverColor usa #233E72 (Azul Acento) de la paleta oficial.
         */
        primary: {
          color: '{primary.500}',
          contrastColor: '#FFFFFF',
          hoverColor: '#233E72',
          activeColor: '{primary.700}'
        },

        /**
         * Escala de superficies y fondos.
         * 50: #F5F2EE corresponde al fondo cálido oficial
         * definido en la Estrategia Visual 2026.
         */
        surface: {
          0: '#FFFFFF',
          50: '#F5F2EE',
          100: '#E8E4DF',
          200: '#D9D5D0',
          300: '#CAC6C1',
          400: '#BBB7B2',
          500: '#ACA8A3',
          600: '#9D9994',
          700: '#8E8A85',
          800: '#7F7B76',
          900: '#706C67',
          950: '#615D58'
        },

        /**
         * Colores de texto para modo claro.
         * mutedColor: #4A5568 garantiza contraste WCAG AA (7.4:1 sobre blanco).
         */
        text: {
          color: '#1E3159',
          hoverColor: '{primary.700}',
          mutedColor: '#4A5568',
          highlightColor: '#1E3159'
        }
      }
    }
  },

  primitive: {
    /**
     * Sistema de colores Ocre Amanecer (acento oficial).
     * Usado para CTAs, botones destacados y elementos de acento.
     *
     * Valores clave:
     * - 200: Ocre Claro (#FFD392)
     * - 500: Ocre Amanecer oficial (#F2A119)
     * - 800: Ocre Oscuro (#A8723A)
     */
    amber: {
      50: '#FFF8E6',
      100: '#FFE8B3',
      200: '#FFD392',
      300: '#FFBE70',
      400: '#FFA94E',
      500: '#F2A119',
      600: '#D68D0E',
      700: '#BA7A0B',
      800: '#A8723A',
      900: '#8C5E2E',
      950: '#704A22'
    },

    /**
     * Sistema de colores Celeste Cielo (complementario).
     * Usado para fondos suaves y estados informativos.
     *
     * Valor clave:
     * - 200: Celeste Cielo oficial (#CCF0FF)
     */
    sky: {
      50: '#F0FAFF',
      100: '#E0F5FF',
      200: '#CCF0FF',
      300: '#B3E5FF',
      400: '#99DAFF',
      500: '#80CFFF',
      600: '#66C4FF',
      700: '#4DB9FF',
      800: '#33AEFF',
      900: '#1AA3FF',
      950: '#0098FF'
    },

    /**
     * Verde semántico para estado de éxito (severity="success").
     *
     * Valor clave:
     * - 500: emerald-500 de Tailwind (#10B981)
     */
    emerald: {
      50: '#ECFDF5',
      100: '#D1FAE5',
      200: '#A7F3D0',
      300: '#6EE7B7',
      400: '#34D399',
      500: '#10B981',
      600: '#059669',
      700: '#047857',
      800: '#065F46',
      900: '#064E3B',
      950: '#022C22'
    },

    /**
     * Rojo semántico para estado de peligro (severity="danger").
     *
     * Valor clave:
     * - 500: red-500 de Tailwind (#EF4444)
     */
    red: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      200: '#FECACA',
      300: '#FCA5A5',
      400: '#F87171',
      500: '#EF4444',
      600: '#DC2626',
      700: '#B91C1C',
      800: '#991B1B',
      900: '#7F1D1D',
      950: '#450A0A'
    },

    /**
     * Gris neutral para botones secundarios (severity="secondary").
     *
     * Valor clave:
     * - 500: zinc-500 de Tailwind (#71717A)
     */
    zinc: {
      50: '#FAFAFA',
      100: '#F4F4F5',
      200: '#E4E4E7',
      300: '#D4D4D8',
      400: '#A1A1AA',
      500: '#71717A',
      600: '#52525B',
      700: '#3F3F46',
      800: '#27272A',
      900: '#18181B',
      950: '#09090B'
    }
  }
});

/**
 * Configuración principal de la aplicación Angular.
 *
 * Provee todos los servicios necesarios incluyendo:
 * - Router con lazy loading
 * - HttpClient para llamadas API
 * - Animaciones del navegador
 * - Tema personalizado de PrimeNG (DigeexPreset)
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([csrfInterceptor, jwtInterceptor, errorInterceptor])
    ),
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restoreSession())),
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es-GT' },
    MessageService,
    ConfirmationService,
    providePrimeNG({
      theme: {
        preset: DigeexPreset,
        options: {
          darkModeSelector: '.dark'
        }
      },
      /**
       * Traducción global de PrimeNG al español. Cubre fileupload, calendar,
       * paginator, confirm dialogs, datatables y demás. Cualquier componente
       * PrimeNG agregado a futuro hereda estas labels sin configuración local.
       */
      translation: {
        /** FileUpload */
        choose: 'Elegir',
        upload: 'Subir',
        cancel: 'Cancelar',
        pending: 'Pendiente',
        fileSizeTypes: ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        noFileChosenMessage: 'No se ha elegido un archivo',
        /** Confirm dialogs */
        accept: 'Aceptar',
        reject: 'Cancelar',
        /** Empty states */
        emptyMessage: 'No se encontraron resultados',
        emptyFilterMessage: 'No hay coincidencias',
        emptySelectionMessage: 'Sin selección',
        emptySearchMessage: 'No hay resultados de búsqueda',
        /** Calendar / DatePicker */
        dayNames: [
          'Domingo',
          'Lunes',
          'Martes',
          'Miércoles',
          'Jueves',
          'Viernes',
          'Sábado',
        ],
        dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
        dayNamesMin: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
        monthNames: [
          'Enero',
          'Febrero',
          'Marzo',
          'Abril',
          'Mayo',
          'Junio',
          'Julio',
          'Agosto',
          'Septiembre',
          'Octubre',
          'Noviembre',
          'Diciembre',
        ],
        monthNamesShort: [
          'Ene',
          'Feb',
          'Mar',
          'Abr',
          'May',
          'Jun',
          'Jul',
          'Ago',
          'Sep',
          'Oct',
          'Nov',
          'Dic',
        ],
        today: 'Hoy',
        clear: 'Limpiar',
        weekHeader: 'Sm',
        firstDayOfWeek: 0,
        dateFormat: 'yy-mm-dd',
        /** ARIA labels (accesibilidad lectores de pantalla) */
        aria: {
          selectAll: 'Seleccionar todo',
          unselectAll: 'Deseleccionar todo',
          close: 'Cerrar',
          previousPageLabel: 'Página anterior',
          nextPageLabel: 'Página siguiente',
          firstPageLabel: 'Primera página',
          lastPageLabel: 'Última página',
          rowsPerPageLabel: 'Filas por página',
          jumpToPageDropdownLabel: 'Saltar a la página',
          jumpToPageInputLabel: 'Ir a la página',
        },
      },
    })
  ]
};
