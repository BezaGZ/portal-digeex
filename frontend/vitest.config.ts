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
    /**
     * El primer it de cada spec paga la compilación TestBed del componente;
     * con la máquina cargada (watch + ng serve + DSpace) los 5s default de
     * Vitest producen timeouts falsos en los forms pesados de PrimeNG.
     */
    testTimeout: 15000,
    /** 
     * Usar 'forks' para aislar cada archivo de test y evitar OOM en CI;
     * maxForks: 2 equilibra uso de RAM y concurrencia.
     */
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2, minForks: 1 },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      /**
       * Cobertura global de todo el frontend. 
       */
      include: ['src/app/**/*.ts'],
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