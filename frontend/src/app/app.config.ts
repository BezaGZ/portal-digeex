import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { firstValueFrom } from 'rxjs';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';
import {
  ChoroplethController,
  GeoFeature,
  ProjectionScale,
  ColorScale,
} from 'chartjs-chart-geo';

/**
 * Plugins y controllers de Chart.js usados por los chart components de Stats:
 * datalabels (valores sobre slices/barras), treemap (tipo `treemap`) y
 * geo (tipo `choropleth` con sus escalas `projection` y `color`).
 */
Chart.register(
  ChartDataLabels,
  TreemapController,
  TreemapElement,
  ChoroplethController,
  GeoFeature,
  ProjectionScale,
  ColorScale,
);

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
     * Verde Quetzal Esmeralda — Macrotema Seguridad. Mapea a la severity
     * "success" de PrimeNG (botones, toasts, badges de estado exitoso).
     * Reemplaza el emerald-500 de Tailwind por la paleta oficial del
     * Gobierno de Guatemala según la Estrategia Visual 2026.
     *
     * Valores clave:
     * - 200: Quetzal Esmeralda claro (#8DD8D3)
     * - 500: Quetzal Esmeralda principal (#026961)
     * - 700: Quetzal Esmeralda oscuro (#235558)
     */
    emerald: {
      50: '#E8F5F4',
      100: '#C6E9E6',
      200: '#8DD8D3',
      300: '#5BBFB7',
      400: '#2FA89E',
      500: '#026961',
      600: '#025651',
      700: '#235558',
      800: '#1B4147',
      900: '#122B30',
      950: '#0A1A1D'
    },

    /**
     * Rojo Baya Wachil — Macrotema Competitividad. Mapea a la severity
     * "danger" de PrimeNG (botones de eliminar, toasts de error, estados
     * críticos). Reemplaza el red-500 de Tailwind por la paleta oficial
     * del Gobierno de Guatemala según la Estrategia Visual 2026.
     *
     * Valores clave:
     * - 100: Baya Wachil claro (#FFE1E5)
     * - 500: Baya Wachil principal (#9F0B30)
     * - 700: Baya Wachil oscuro (#7B162F)
     */
    red: {
      50: '#FFF5F7',
      100: '#FFE1E5',
      200: '#FFC6CD',
      300: '#F08AA0',
      400: '#D44D72',
      500: '#9F0B30',
      600: '#8A0A2A',
      700: '#7B162F',
      800: '#5E1126',
      900: '#3F0C1A',
      950: '#20060D'
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
