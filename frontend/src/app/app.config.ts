import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { firstValueFrom } from 'rxjs';

import { registerLocaleData } from '@angular/common';
import localeEsGT from '@angular/common/locales/es-GT';

registerLocaleData(localeEsGT);

import { routes } from './app.routes';
import { xsrfInterceptor } from './core/xsrf/xsrf.interceptor';
import { jwtInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/error/error.interceptor';
import { AuthService } from './core/auth/auth.service';
import { XsrfService } from './core/xsrf/xsrf.service';
import { CallerProvider } from './core/auth/caller-provider';
import { AuthCallerService } from './features/administration/shared/services/auth-caller.service';





/**
 * Preset de PrimeNG con la paleta oficial del Gobierno de Guatemala
 * (Estrategia Visual 2026). Las anclas oficiales referencian las CSS vars
 * de `styles.css` (fuente única de la paleta) vía `var(--color-*)`; los
 * tonos intermedios de cada escala (50-950) son derivaciones propias sin
 * equivalente en la fuente y quedan como hex.
 *
 * @see {@link https://primeng.org/theming#customization PrimeNG Theming}
 */
const DigeexPreset = definePreset(Aura, {
  semantic: {
    /**
     * Escala del primario institucional (base #1E3159, Azul Gobierno).
     * PrimeNG deriva de aquí hover, focus, active y disabled.
     */
    primary: {
      50: '#E8EDF5',
      100: '#C4D0E5',
      200: '#9DB1D4',
      300: '#7691C3',
      400: '#5879B6',
      500: 'var(--color-gob-primary)',
      600: '#1A2B4E',
      700: '#162443',
      800: '#121D38',
      900: '#0C1327',
      950: '#080D1A'
    },

    colorScheme: {
      light: {
        /** hoverColor usa el Azul Acento oficial (#233E72). */
        primary: {
          color: '{primary.500}',
          contrastColor: 'var(--color-surface)',
          hoverColor: 'var(--color-gob-primary-light)',
          activeColor: '{primary.700}'
        },

        /** Superficies y fondos; 50 es el fondo cálido oficial (#F5F2EE). */
        surface: {
          0: 'var(--color-surface)',
          50: 'var(--color-background)',
          100: '#E8E4DF',
          200: 'var(--color-border)',
          300: '#CAC6C1',
          400: '#BBB7B2',
          500: '#ACA8A3',
          600: '#9D9994',
          700: '#8E8A85',
          800: '#7F7B76',
          900: '#706C67',
          950: '#615D58'
        },

        /** mutedColor #4A5568 garantiza contraste WCAG AA (7.4:1 sobre blanco). */
        text: {
          color: 'var(--color-text-primary)',
          hoverColor: '{primary.700}',
          mutedColor: 'var(--color-text-secondary)',
          highlightColor: 'var(--color-text-primary)'
        }
      }
    }
  },

  primitive: {
    /**
     * Ocre Amanecer (acento oficial) para CTAs y botones destacados.
     * Anclas oficiales en 200, 500 y 800; el resto es derivación propia.
     */
    amber: {
      50: '#FFF8E6',
      100: '#FFE8B3',
      200: 'var(--color-gob-accent-light)',
      300: '#FFBE70',
      400: '#FFA94E',
      500: 'var(--color-gob-accent)',
      600: '#D68D0E',
      700: '#BA7A0B',
      800: 'var(--color-gob-accent-dark)',
      900: '#8C5E2E',
      950: '#704A22'
    },

    /** Celeste Cielo (complementario) para fondos suaves; ancla oficial en 200. */
    sky: {
      50: '#F0FAFF',
      100: '#E0F5FF',
      200: 'var(--color-gob-sky)',
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
     * Verde Quetzal Esmeralda (macrotema Seguridad) mapeado a la severity
     * "success" de PrimeNG en lugar del emerald de Tailwind. Anclas
     * oficiales en 200, 500 y 700.
     */
    emerald: {
      50: '#E8F5F4',
      100: '#C6E9E6',
      200: 'var(--color-seguridad-light)',
      300: '#5BBFB7',
      400: '#2FA89E',
      500: 'var(--color-seguridad)',
      600: '#025651',
      700: 'var(--color-seguridad-dark)',
      800: '#1B4147',
      900: '#122B30',
      950: '#0A1A1D'
    },

    /**
     * Rojo Baya Wachil (macrotema Competitividad) mapeado a la severity
     * "danger" de PrimeNG en lugar del red de Tailwind. Anclas oficiales
     * en 100, 500 y 700.
     */
    red: {
      50: '#FFF5F7',
      100: 'var(--color-competitividad-light)',
      200: '#FFC6CD',
      300: '#F08AA0',
      400: '#D44D72',
      500: 'var(--color-competitividad)',
      600: '#8A0A2A',
      700: 'var(--color-competitividad-dark)',
      800: '#5E1126',
      900: '#3F0C1A',
      950: '#20060D'
    },

    /** Gris neutral estándar (zinc de Tailwind) para severity "secondary". */
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
  },

  components: {
    button: {
      colorScheme: {
        dark: {
          root: {
            /**
             * En oscuro Aura saca el texto de primary/success de surface.900
             * (letras negras sobre azul/verde institucional) y pinta danger
             * rosa con texto casi negro. Se fuerza blanco y el rojo {red.500},
             * espejo del modo claro (contraste 8.9:1).
             */
            primary: {
              color: '#ffffff',
              hoverColor: '#ffffff',
              activeColor: '#ffffff'
            },
            success: {
              color: '#ffffff',
              hoverColor: '#ffffff',
              activeColor: '#ffffff'
            },
            danger: {
              background: '{red.500}',
              hoverBackground: '{red.600}',
              activeBackground: '{red.700}',
              borderColor: '{red.500}',
              hoverBorderColor: '{red.600}',
              activeBorderColor: '{red.700}',
              color: '#ffffff',
              hoverColor: '#ffffff',
              activeColor: '#ffffff'
            }
          }
        }
      }
    },
    /**
     * El content y el footer de Aura traen padding-top 0, pegando el
     * contenido al header y los botones al contenido; se igualan los cuatro lados.
     */
    dialog: {
      content: {
        padding: '{overlay.modal.padding}'
      },
      footer: {
        padding: '{overlay.modal.padding}'
      }
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([xsrfInterceptor, jwtInterceptor, errorInterceptor]),
      withNoXsrfProtection()
    ),
    provideAppInitializer(() => inject(XsrfService).initXSRFToken()),
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restoreSession())),
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es-GT' },
    MessageService,
    ConfirmationService,
    // Cablea el contrato de identidad del core (CallerProvider) a su
    // implementación de feature, sin que el core importe de features.
    { provide: CallerProvider, useExisting: AuthCallerService },
    providePrimeNG({
      theme: {
        preset: DigeexPreset,
        options: {
          darkModeSelector: '.dark'
        }
      },
      /**
       * Traducción global de PrimeNG al español. Cualquier componente
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
