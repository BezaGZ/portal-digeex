/// <reference types="vitest" />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        /** Servicios core del Sprint 4 */
        'src/app/core/api/discovery.service.ts',
        'src/app/core/api/bitstream.service.ts',
        'src/app/core/api/collection-cache.service.ts',
        'src/app/core/api/dspace-api.service.ts',

        /** Búsqueda avanzada + facetas */
        'src/app/features/search/**/*.ts',

        /** Galería */
        'src/app/features/gallery/**/*.ts',

        /** Home */
        'src/app/features/home/**/*.ts',

        /** Sprint 5 — Auth, sesión e interceptors */
        'src/app/core/auth/**/*.ts',
        'src/app/core/csrf/**/*.ts',
        'src/app/core/error/**/*.ts',

        /** Sprint 5 — Wrappers HTTP para gestión de usuarios */
        'src/app/core/api/eperson-api.service.ts',
        'src/app/core/api/group-api.service.ts',

        /** Sprint 5 — Panel administrativo y login */
        'src/app/features/administration/**/*.ts',
        'src/app/features/auth/**/*.ts',

        /** Sprint 5 — Shell admin tocado puntualmente */
        'src/app/layout/admin-layout/app.menu/**/*.ts',
        'src/app/layout/admin-layout/app.topbar/app.topbar.ts',

        /** Sprint 5 — Modal de aviso de inactividad */
        'src/app/shared/components/session-warning-modal/**/*.ts',

        /** Sprint 6 — Wrappers HTTP */
        'src/app/core/api/bundle-api.service.ts',
        'src/app/core/api/collection-api.service.ts',
        'src/app/core/api/community-api.service.ts',
        'src/app/core/api/item-api.service.ts',
        'src/app/core/api/json-patch.util.ts',
        'src/app/core/api/my-dspace-api.service.ts',
        'src/app/core/api/submission-form-api.service.ts',
        'src/app/core/api/vocabulary-api.service.ts',
        'src/app/core/api/vocabulary-display.service.ts',
        'src/app/core/api/workspaceitem-api.service.ts',
        'src/app/core/api/bitstream-download.service.ts',

        /** Sprint 6 — Fechas ISO locales */
        'src/app/core/i18n/**/*.ts',
      ],
      exclude: [
        'node_modules/',
        'src/test-setup.ts',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.model.ts',
        '**/index.ts',
      ],
    },
  },
  define: {
    'import.meta.vitest': undefined,
  },
});