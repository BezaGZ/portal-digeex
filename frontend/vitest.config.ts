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